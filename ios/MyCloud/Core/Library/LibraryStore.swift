import Foundation
import Observation

/// The signed-in user's library, shared by every screen so likes and
/// playlists stay consistent across tabs.
///
/// The server has no "my liked tracks" endpoint: like the web client, liked
/// tracks/albums are the catalogue filtered by `likedByMe`.
@MainActor
@Observable
final class LibraryStore {
    private(set) var likedTracks: Loadable<[Track]> = .idle
    private(set) var likedAlbums: Loadable<[Album]> = .idle
    private(set) var playlists: Loadable<[Playlist]> = .idle

    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    var hasLoaded: Bool {
        likedTracks.value != nil || playlists.value != nil
    }

    func load() async {
        let api = self.api
        async let tracks = Self.result { try await api.send(API.Catalog.tracks()) }
        async let albums = Self.result { try await api.send(API.Catalog.albums()) }
        async let lists = Self.result { try await api.send(API.Playlists.list()) }
        let (tracksResult, albumsResult, listsResult) = await (tracks, albums, lists)

        apply(tracksResult.map { $0.filter(\.likedByMe) }, to: \.likedTracks)
        apply(albumsResult.map { $0.filter(\.likedByMe) }, to: \.likedAlbums)
        apply(listsResult, to: \.playlists)
    }

    func reloadPlaylists() async {
        do {
            playlists = .loaded(try await api.send(API.Playlists.list()))
        } catch {
            guard let apiError = APIError(error), playlists.value == nil else { return }
            playlists = .failed(apiError)
        }
    }

    func playlist(id: String) -> Playlist? {
        playlists.value?.first { $0.id == id }
    }

    /// Drops everything (sign-out / account switch).
    func reset() {
        likedTracks = .idle
        likedAlbums = .idle
        playlists = .idle
    }

    private func apply<T>(_ result: Result<T, Error>, to keyPath: ReferenceWritableKeyPath<LibraryStore, Loadable<T>>) {
        switch result {
        case .success(let value):
            self[keyPath: keyPath] = .loaded(value)
        case .failure(let error):
            // Keep stale data on a failed refresh.
            guard let apiError = APIError(error), self[keyPath: keyPath].value == nil else { return }
            self[keyPath: keyPath] = .failed(apiError)
        }
    }

    private nonisolated static func result<T: Sendable>(_ work: @Sendable () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await work()) } catch { return .failure(error) }
    }
}
