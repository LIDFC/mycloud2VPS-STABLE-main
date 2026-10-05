import AVFoundation

enum AudioSessionEvent: Equatable {
    /// A call, alarm or another app took over audio.
    case interruptionBegan
    /// The interruption ended; `shouldResume` is the system's hint.
    case interruptionEnded(shouldResume: Bool)
    /// Headphones / Bluetooth disconnected: Apple's guidelines say pause.
    case outputDeviceLost
}

/// Abstraction over `AVAudioSession` so the player can be exercised without
/// touching the real audio hardware.
@MainActor
protocol AudioSessionControlling: AnyObject {
    var onEvent: ((AudioSessionEvent) -> Void)? { get set }
    func activate()
    func deactivate()
}

/// `.playback`: plays with the silent switch on and keeps playing in the
/// background (with the `audio` background mode enabled).
@MainActor
final class SystemAudioSession: AudioSessionControlling {
    var onEvent: ((AudioSessionEvent) -> Void)?

    private var isConfigured = false
    private var isActive = false
    private var observers: [NSObjectProtocol] = []

    init() {
        let center = NotificationCenter.default
        let session = AVAudioSession.sharedInstance()

        observers.append(center.addObserver(
            forName: AVAudioSession.interruptionNotification, object: session, queue: .main
        ) { [weak self] notification in
            let event = Self.interruptionEvent(from: notification)
            MainActor.assumeIsolated {
                guard let self, let event else { return }
                if event == .interruptionBegan { self.isActive = false }
                self.onEvent?(event)
            }
        })

        observers.append(center.addObserver(
            forName: AVAudioSession.routeChangeNotification, object: session, queue: .main
        ) { [weak self] notification in
            let lost = Self.isOldDeviceUnavailable(notification)
            MainActor.assumeIsolated {
                guard let self, lost else { return }
                self.onEvent?(.outputDeviceLost)
            }
        })

        observers.append(center.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification, object: session, queue: .main
        ) { [weak self] _ in
            // The audio daemon restarted: our session configuration is gone.
            MainActor.assumeIsolated {
                self?.isConfigured = false
                self?.isActive = false
            }
        })
    }

    func activate() {
        let session = AVAudioSession.sharedInstance()
        do {
            if !isConfigured {
                try session.setCategory(.playback, mode: .default, policy: .longFormAudio)
                isConfigured = true
            }
            if !isActive {
                try session.setActive(true)
                isActive = true
            }
        } catch {
            // Playback still works in the foreground; nothing useful to show the user.
            print("[audio] Failed to activate session: \(error)")
        }
    }

    func deactivate() {
        guard isActive else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        isActive = false
    }

    private nonisolated static func interruptionEvent(from notification: Notification) -> AudioSessionEvent? {
        guard let info = notification.userInfo,
              let rawType = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType)
        else { return nil }
        switch type {
        case .began:
            return .interruptionBegan
        case .ended:
            let rawOptions = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: rawOptions)
            return .interruptionEnded(shouldResume: options.contains(.shouldResume))
        @unknown default:
            return nil
        }
    }

    private nonisolated static func isOldDeviceUnavailable(_ notification: Notification) -> Bool {
        guard let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: raw)
        else { return false }
        return reason == .oldDeviceUnavailable
    }
}
