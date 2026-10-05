import Foundation
import Observation

/// Phase 1 smoke screen: proves the app reaches the real backend over HTTPS
/// and decodes the real catalogue.
@MainActor
@Observable
final class ServerStatusViewModel {
    struct Snapshot {
        let uptime: Double?
        let trackCount: Int
        let albumCount: Int
        let latestTracks: [Track]
    }

    private(set) var state: Loadable<Snapshot> = .idle
    let serverURL: URL

    private let api: APIClient

    init(api: APIClient) {
        self.api = api
        self.serverURL = api.baseURL
    }

    func load() async {
        if state.value == nil { state = .loading }
        do {
            async let health = api.send(API.health())
            async let tracks = api.send(API.Catalog.tracks())
            async let albums = api.send(API.Catalog.albums())
            let (healthResponse, trackList, albumList) = try await (health, tracks, albums)

            let latest = trackList
                .sorted { ($0.createdAt ?? .distantPast) > ($1.createdAt ?? .distantPast) }
                .prefix(10)
            state = .loaded(Snapshot(
                uptime: healthResponse.uptime,
                trackCount: trackList.count,
                albumCount: albumList.count,
                latestTracks: Array(latest)
            ))
        } catch {
            guard let apiError = APIError(error) else { return }
            state = .failed(apiError)
        }
    }
}
