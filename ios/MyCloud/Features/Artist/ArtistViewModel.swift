import Foundation
import Observation

@MainActor
@Observable
final class ArtistViewModel {
    private(set) var state: Loadable<UserProfile> = .idle
    let username: String
    private let api: APIClient

    init(username: String, api: APIClient) {
        self.username = username
        self.api = api
    }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            state = .loaded(try await api.send(API.Catalog.profile(username: username)))
        } catch {
            guard let apiError = APIError(error) else { return }
            if state.value == nil { state = .failed(apiError) }
        }
    }

    /// Most played first — the server returns upload order.
    static func popularTracks(_ profile: UserProfile) -> [Track] {
        profile.tracks.filter { $0.status == "published" }.sorted { $0.playsCount > $1.playsCount }
    }

    static func publishedAlbums(_ profile: UserProfile) -> [Album] {
        profile.albums
            .filter { $0.status == "published" && !($0.tracks?.isEmpty ?? true) }
            .sorted { ($0.createdAt ?? .distantPast) > ($1.createdAt ?? .distantPast) }
    }
}
