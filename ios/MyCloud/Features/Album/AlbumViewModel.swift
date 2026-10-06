import Foundation
import Observation

@MainActor
@Observable
final class AlbumViewModel {
    private(set) var state: Loadable<Album> = .idle
    let albumID: String
    /// Content shown is the last saved copy (network unavailable).
    private(set) var isShowingCachedData = false
    private let api: APIClient

    init(albumID: String, api: APIClient) {
        self.albumID = albumID
        self.api = api
    }

    func load() async {
        if state.value == nil {
            if let cached = await api.cached(API.Catalog.album(id: albumID)) {
                state = .loaded(cached)
                isShowingCachedData = true
            } else {
                state = .loading
            }
        }
        do {
            let result = try await api.sendOrCached(API.Catalog.album(id: albumID))
            state = .loaded(result.value)
            isShowingCachedData = result.isCached
        } catch {
            guard let apiError = APIError(error) else { return }
            if state.value == nil { state = .failed(apiError) }
        }
    }
}
