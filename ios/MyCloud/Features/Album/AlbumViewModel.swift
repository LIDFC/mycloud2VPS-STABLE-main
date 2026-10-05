import Foundation
import Observation

@MainActor
@Observable
final class AlbumViewModel {
    private(set) var state: Loadable<Album> = .idle
    let albumID: String
    private let api: APIClient

    init(albumID: String, api: APIClient) {
        self.albumID = albumID
        self.api = api
    }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            state = .loaded(try await api.send(API.Catalog.album(id: albumID)))
        } catch {
            guard let apiError = APIError(error) else { return }
            if state.value == nil { state = .failed(apiError) }
        }
    }
}
