import Foundation

/// Reports that a track started playing (server play counter + genre-based
/// recommendations). Fire-and-forget: a failed report never affects playback.
struct ListenRecorder: Sendable {
    let record: @Sendable (_ trackID: String) -> Void

    static func live(api: APIClient) -> ListenRecorder {
        ListenRecorder { trackID in
            Task.detached(priority: .utility) {
                _ = try? await api.send(API.Library.recordListen(trackId: trackID))
            }
        }
    }

    static let disabled = ListenRecorder { _ in }
}
