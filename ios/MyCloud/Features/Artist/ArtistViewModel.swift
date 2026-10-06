import Foundation
import Observation

@MainActor
@Observable
final class ArtistViewModel {
    private(set) var state: Loadable<UserProfile> = .idle
    let username: String
    /// Content shown is the last saved copy (network unavailable).
    private(set) var isShowingCachedData = false
    private let api: APIClient

    init(username: String, api: APIClient) {
        self.username = username
        self.api = api
    }

    func load() async {
        if state.value == nil {
            if let cached = await api.cached(API.Catalog.profile(username: username)) {
                state = .loaded(cached)
                isShowingCachedData = true
            } else {
                state = .loading
            }
        }
        do {
            let result = try await api.sendOrCached(API.Catalog.profile(username: username))
            state = .loaded(result.value)
            isShowingCachedData = result.isCached
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
