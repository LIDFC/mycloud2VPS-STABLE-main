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
    /// Content shown is the last saved copy (network unavailable).
    private(set) var isShowingCachedData = false
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    /// Shows the cached copy instantly, then refreshes from the network.
    /// Sections load independently: one failing endpoint hides its shelf,
    /// only a total failure (with nothing cached) shows the error screen.
    func load() async {
        if state.value == nil {
            if let cached = await cachedContent() {
                state = .loaded(cached)
                isShowingCachedData = true
            } else {
                state = .loading
            }
        }

        let api = self.api
        async let dailyResult = Self.result { try await api.sendOrCached(API.Catalog.dailyPlaylist()) }
        async let albumsResult = Self.result { try await api.sendOrCached(API.Catalog.albums()) }
        async let genresResult = Self.result { try await api.sendOrCached(API.Catalog.recommendations()) }
        let (daily, albums, genres) = await (dailyResult, albumsResult, genresResult)

        if case .failure(let error) = daily, case .failure = albums, case .failure = genres {
            guard let apiError = APIError(error) else { return }
            // Keep showing what we have on a failed refresh.
            if state.value == nil { state = .failed(apiError) } else { isShowingCachedData = true }
            return
        }

        isShowingCachedData = Self.isCached(daily) || Self.isCached(albums) || Self.isCached(genres)
        state = .loaded(Content(
            daily: try? daily.get().value,
            newAlbums: Self.newestAlbums((try? albums.get().value) ?? []),
            genres: (try? genres.get().value)?.groups.filter { !$0.tracks.isEmpty } ?? []
        ))
    }

    private func cachedContent() async -> Content? {
        let daily = await api.cached(API.Catalog.dailyPlaylist())
        let albums = await api.cached(API.Catalog.albums())
        let genres = await api.cached(API.Catalog.recommendations())
        let content = Content(
            daily: daily,
            newAlbums: Self.newestAlbums(albums ?? []),
            genres: genres?.groups.filter { !$0.tracks.isEmpty } ?? []
        )
        return content.isEmpty ? nil : content
    }

    static func newestAlbums(_ albums: [Album]) -> [Album] {
        albums
            .filter { $0.status == "published" && !($0.tracks?.isEmpty ?? true) }
            .sorted { ($0.createdAt ?? .distantPast) > ($1.createdAt ?? .distantPast) }
            .prefix(12)
            .map { $0 }
    }

    private static func isCached<V>(_ result: Result<(value: V, isCached: Bool), Error>) -> Bool {
        (try? result.get().isCached) ?? false
    }

    private nonisolated static func result<T: Sendable>(_ work: @Sendable () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await work()) } catch { return .failure(error) }
    }
}
