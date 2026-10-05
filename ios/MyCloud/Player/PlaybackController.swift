import AVFoundation
import Foundation
import Observation

/// The single app-wide player: owns the `AVPlayer`, the `PlayQueue`
/// and the published playback state the UI renders.
///
/// Audio is streamed from `/api/stream/:id`, which supports HTTP Range
/// requests, so seeking works without downloading the whole file.
@MainActor
@Observable
final class PlaybackController {
    private(set) var queue = PlayQueue()
    private(set) var isPlaying = false
    private(set) var isBuffering = false
    /// Seconds. While the user scrubs, this is frozen to avoid jumping.
    private(set) var currentTime: Double = 0
    private(set) var duration: Double = 0
    private(set) var errorMessage: String?

    var currentTrack: Track? { queue.current }
    var progress: Double { duration > 0 ? min(max(currentTime / duration, 0), 1) : 0 }

    /// Fired whenever the current track or playback state changes in a way the
    /// system Now Playing info must reflect (wired up by Phase 5).
    @ObservationIgnored var onStateChange: (@MainActor () -> Void)?

    @ObservationIgnored private let player = AVPlayer()
    @ObservationIgnored private let api: APIClient
    @ObservationIgnored private let audioSession: AudioSessionControlling
    @ObservationIgnored private var timeObserver: Any?
    @ObservationIgnored private var itemObservations: [NSKeyValueObservation] = []
    @ObservationIgnored private var playerObservation: NSKeyValueObservation?
    @ObservationIgnored private var endObserver: NSObjectProtocol?
    @ObservationIgnored private var isScrubbing = false
    /// Remembered so a stalled/failed item can be resumed at the same spot.
    @ObservationIgnored private var wantsToPlay = false

    /// "Previous" restarts the track instead when we're past this point.
    static let restartThreshold: Double = 3

    init(api: APIClient, audioSession: AudioSessionControlling = SystemAudioSession()) {
        self.api = api
        self.audioSession = audioSession
        player.automaticallyWaitsToMinimizeStalling = true
        observePlayer()
        audioSession.onEvent = { [weak self] event in self?.handle(event) }
    }

    // MARK: - Audio session events

    /// Was playing when an interruption (call, Siri, alarm) began.
    @ObservationIgnored private var resumeAfterInterruption = false

    func handle(_ event: AudioSessionEvent) {
        switch event {
        case .interruptionBegan:
            resumeAfterInterruption = wantsToPlay
            // The system already paused the audio; keep our state honest.
            isPlaying = false
            onStateChange?()
        case .interruptionEnded(let shouldResume):
            if shouldResume, resumeAfterInterruption { resume() }
            resumeAfterInterruption = false
        case .outputDeviceLost:
            // Headphones unplugged / AirPods out: never blast through the speaker.
            pause()
        }
    }

    // MARK: - Starting playback

    func play(_ tracks: [Track], startAt index: Int, shuffled: Bool) {
        queue.load(tracks, startIndex: shuffled ? nil : index, shuffled: shuffled)
        startCurrent(autoplay: true)
    }

    func togglePlayPause() {
        isPlaying ? pause() : resume()
    }

    func resume() {
        guard currentTrack != nil else { return }
        if player.currentItem == nil || player.currentItem?.status == .failed {
            // Reload a failed item (e.g. network dropped) at the same position.
            startCurrent(autoplay: true, at: currentTime)
            return
        }
        wantsToPlay = true
        audioSession.activate()
        player.play()
    }

    func pause() {
        wantsToPlay = false
        player.pause()
    }

    /// Clears everything (sign-out).
    func stop() {
        wantsToPlay = false
        player.pause()
        player.replaceCurrentItem(with: nil)
        clearItemObservers()
        queue.clear()
        currentTime = 0
        duration = 0
        errorMessage = nil
        isPlaying = false
        isBuffering = false
        audioSession.deactivate()
        onStateChange?()
    }

    // MARK: - Navigation

    func next() {
        if queue.skipForward() != nil {
            startCurrent(autoplay: true)
        } else {
            // End of a non-repeating queue: stop at the end of the last track.
            pause()
            seek(to: duration)
        }
    }

    func previous() {
        if currentTime > Self.restartThreshold || queue.skipBackward() == nil {
            seek(to: 0)
        } else {
            startCurrent(autoplay: true)
        }
    }

    func playFromUpNext(_ index: Int) {
        guard queue.jump(toUpNext: index) != nil else { return }
        startCurrent(autoplay: true)
    }

    // MARK: - Queue editing

    func playNext(_ track: Track) {
        let wasEmpty = queue.isEmpty
        queue.playNext(track)
        if wasEmpty { startCurrent(autoplay: true) }
    }

    func addToQueue(_ track: Track) {
        let wasEmpty = queue.isEmpty
        queue.append(track)
        if wasEmpty { startCurrent(autoplay: true) }
    }

    func removeFromUpNext(at index: Int) {
        queue.removeFromUpNext(at: index)
    }

    func moveUpNext(fromOffsets source: IndexSet, toOffset destination: Int) {
        queue.moveUpNext(fromOffsets: source, toOffset: destination)
    }

    func toggleShuffle() {
        queue.setShuffled(!queue.isShuffled)
    }

    func cycleRepeatMode() {
        queue.repeatMode = queue.repeatMode.next
    }

    /// Keeps like state in sync after the user (un)likes a queued track.
    func updateTrack(_ track: Track) {
        queue.updateTrack(track)
        onStateChange?()
    }

    // MARK: - Seeking

    func beginScrubbing() {
        isScrubbing = true
    }

    /// Updates the displayed time while dragging, without seeking yet.
    func scrub(to seconds: Double) {
        currentTime = clamped(seconds)
    }

    func endScrubbing(at seconds: Double) {
        seek(to: seconds)
    }

    func seek(to seconds: Double) {
        let target = clamped(seconds)
        currentTime = target
        isScrubbing = true
        let time = CMTime(seconds: target, preferredTimescale: 600)
        player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            Task { @MainActor in
                self?.isScrubbing = false
                self?.onStateChange?()
            }
        }
    }

    func skip(by delta: Double) {
        seek(to: currentTime + delta)
    }

    private func clamped(_ seconds: Double) -> Double {
        let upper = duration > 0 ? duration : seconds
        return min(max(seconds, 0), max(upper, 0))
    }

    // MARK: - Loading items

    private func startCurrent(autoplay: Bool, at startTime: Double = 0) {
        guard let track = queue.current else {
            stop()
            return
        }
        errorMessage = nil
        currentTime = startTime
        duration = track.duration ?? 0

        guard let url = api.mediaURL(for: track.audioUrl) else {
            errorMessage = String(localized: "Не удалось открыть трек")
            return
        }

        let item = AVPlayerItem(url: url)
        // Lets AVPlayer fetch ahead for gapless-ish transitions on slow networks.
        item.preferredForwardBufferDuration = 30
        observe(item)
        player.replaceCurrentItem(with: item)

        if startTime > 0 {
            player.seek(to: CMTime(seconds: startTime, preferredTimescale: 600))
        }
        if autoplay {
            wantsToPlay = true
            audioSession.activate()
            player.play()
            recordListen(track)
        }
        onStateChange?()
    }

    /// Counts a play on the server (play counter + genre recommendations),
    /// like the web client does when a track starts.
    private func recordListen(_ track: Track) {
        let api = self.api
        Task.detached(priority: .utility) {
            _ = try? await api.send(API.Library.recordListen(trackId: track.id))
        }
    }

    // MARK: - Observation

    private func observePlayer() {
        let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            MainActor.assumeIsolated {
                guard let self, !self.isScrubbing else { return }
                let seconds = time.seconds
                if seconds.isFinite { self.currentTime = seconds }
            }
        }

        playerObservation = player.observe(\.timeControlStatus, options: [.initial, .new]) { [weak self] player, _ in
            let status = player.timeControlStatus
            Task { @MainActor in
                guard let self else { return }
                let playing = status == .playing
                let buffering = status == .waitingToPlayAtSpecifiedRate
                guard playing != self.isPlaying || buffering != self.isBuffering else { return }
                self.isPlaying = playing
                self.isBuffering = buffering
                self.onStateChange?()
            }
        }
    }

    private func observe(_ item: AVPlayerItem) {
        clearItemObservers()

        itemObservations.append(item.observe(\.status, options: [.new]) { [weak self] item, _ in
            let status = item.status
            let message = item.error.map(Self.message(for:))
            Task { @MainActor in
                guard let self, item === self.player.currentItem else { return }
                if status == .failed {
                    self.isPlaying = false
                    self.isBuffering = false
                    self.errorMessage = message ?? String(localized: "Не удалось воспроизвести трек")
                    self.onStateChange?()
                }
            }
        })

        itemObservations.append(item.observe(\.duration, options: [.new]) { [weak self] item, _ in
            let seconds = item.duration.seconds
            Task { @MainActor in
                guard let self, item === self.player.currentItem, seconds.isFinite, seconds > 0 else { return }
                self.duration = seconds
                self.onStateChange?()
            }
        })

        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.trackDidFinish() }
        }
    }

    private func clearItemObservers() {
        itemObservations.forEach { $0.invalidate() }
        itemObservations.removeAll()
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
            self.endObserver = nil
        }
    }

    private func trackDidFinish() {
        if queue.advanceAfterFinish() != nil {
            startCurrent(autoplay: true)
        } else {
            // Queue finished: rewind the last track and stop, like Apple Music.
            wantsToPlay = false
            player.pause()
            seek(to: 0)
        }
    }

    private nonisolated static func message(for error: Error) -> String {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain,
           let apiError = APIClient.mapTransportError(URLError(URLError.Code(rawValue: nsError.code))) as? APIError {
            return apiError.localizedDescription
        }
        return String(localized: "Не удалось воспроизвести трек")
    }
}
