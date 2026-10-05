import MediaPlayer
import UIKit

/// Publishes the current track to the lock screen / Control Center / Dynamic
/// Island and routes the system's remote commands (headphones, CarPlay-less
/// car stereos, AirPods, lock screen buttons) back to the player.
@MainActor
final class NowPlayingCenter {
    private let player: PlaybackController
    private let api: APIClient
    private let infoCenter = MPNowPlayingInfoCenter.default()
    private let commands = MPRemoteCommandCenter.shared()

    private var artworkTrackID: String?
    private var artwork: MPMediaItemArtwork?
    private var artworkTask: Task<Void, Never>?

    init(player: PlaybackController, api: APIClient) {
        self.player = player
        self.api = api
        registerCommands()
        player.onStateChange = { [weak self] in self?.update() }
    }

    // MARK: - Now playing info

    func update() {
        guard let track = player.currentTrack else {
            infoCenter.nowPlayingInfo = nil
            infoCenter.playbackState = .stopped
            artworkTask?.cancel()
            artworkTrackID = nil
            artwork = nil
            return
        }

        var info: [String: Any] = [
            MPMediaItemPropertyTitle: track.title,
            MPMediaItemPropertyArtist: track.artistLine,
            MPMediaItemPropertyPlaybackDuration: player.duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: player.currentTime,
            // 0 while paused/buffering so the lock screen clock doesn't run on.
            MPNowPlayingInfoPropertyPlaybackRate: player.isPlaying ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
        ]
        if let genre = track.genre { info[MPMediaItemPropertyGenre] = genre }

        if artworkTrackID != track.id {
            artworkTrackID = track.id
            artwork = nil
            loadArtwork(for: track)
        }
        if let artwork { info[MPMediaItemPropertyArtwork] = artwork }

        infoCenter.nowPlayingInfo = info
        infoCenter.playbackState = player.isPlaying ? .playing : .paused

        commands.nextTrackCommand.isEnabled = player.queue.hasNext
        commands.previousTrackCommand.isEnabled = true
    }

    private func loadArtwork(for track: Track) {
        artworkTask?.cancel()
        guard let url = api.mediaURL(for: track.coverUrl) else { return }
        artworkTask = Task { [weak self] in
            guard let image = await ImagePipeline.shared.image(for: url, pixelSize: 1024),
                  !Task.isCancelled, let self, self.artworkTrackID == track.id
            else { return }
            self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            self.update()
        }
    }

    // MARK: - Remote commands

    private func registerCommands() {
        commands.playCommand.addTarget { [weak self] _ in
            self?.player.resume()
            return .success
        }
        commands.pauseCommand.addTarget { [weak self] _ in
            self?.player.pause()
            return .success
        }
        commands.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.player.togglePlayPause()
            return .success
        }
        commands.nextTrackCommand.addTarget { [weak self] _ in
            guard let self, self.player.queue.hasNext else { return .noActionableNowPlayingItem }
            self.player.next()
            return .success
        }
        commands.previousTrackCommand.addTarget { [weak self] _ in
            self?.player.previous()
            return .success
        }
        commands.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.player.seek(to: event.positionTime)
            return .success
        }
        // Prev/next buttons rather than ±15 s skip buttons on the lock screen.
        commands.skipForwardCommand.isEnabled = false
        commands.skipBackwardCommand.isEnabled = false
        commands.seekForwardCommand.isEnabled = false
        commands.seekBackwardCommand.isEnabled = false
    }
}
