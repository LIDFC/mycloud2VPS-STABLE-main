import Foundation
import Observation

@MainActor
@Observable
final class HomeViewModel {
    struct Content {
        var daily: DailyPlaylist?
        var newAlbums: [Album]
        var genres: [Recommendations.GenreGroup]

        var isEmpty: Bool { (daily?.tracks.isEmpty ?? true) && newAlbums.isEmpty && genres.isEmpty }
    }

    private(set) var state: Loadable<Content> = .idle
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    /// Sections load independently: one failing endpoint hides its shelf,
    /// only a total failure shows the error screen.
    func load() async {
        if state.value == nil { state = .loading }

        let api = self.api
        async let dailyResult = Self.result { try await api.send(API.Catalog.dailyPlaylist()) }
        async let albumsResult = Self.result { try await api.send(API.Catalog.albums()) }
        async let genresResult = Self.result { try await api.send(API.Catalog.recommendations()) }
        let (daily, albums, genres) = await (dailyResult, albumsResult, genresResult)

        if case .failure(let error) = daily, case .failure = albums, case .failure = genres {
            guard let apiError = APIError(error) else { return }
            // Keep showing stale content on a failed refresh.
            if state.value == nil { state = .failed(apiError) }
            return
        }

        state = .loaded(Content(
            daily: try? daily.get(),
            newAlbums: Self.newestAlbums((try? albums.get()) ?? []),
            genres: (try? genres.get())?.groups.filter { !$0.tracks.isEmpty } ?? []
        ))
    }

    static func newestAlbums(_ albums: [Album]) -> [Album] {
        albums
            .filter { $0.status == "published" && !($0.tracks?.isEmpty ?? true) }
            .sorted { ($0.createdAt ?? .distantPast) > ($1.createdAt ?? .distantPast) }
            .prefix(12)
            .map { $0 }
    }

    private nonisolated static func result<T: Sendable>(_ work: @Sendable () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await work()) } catch { return .failure(error) }
    }
}
