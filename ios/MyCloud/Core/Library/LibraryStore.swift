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
    // Mutated only by LibraryStore and its extensions (LibraryStore+Actions).
    var likedTracks: Loadable<[Track]> = .idle
    var likedAlbums: Loadable<[Album]> = .idle
    var playlists: Loadable<[Playlist]> = .idle

    /// One-line feedback for a toast ("Добавлено в …", errors of background actions).
    var message: String?

    /// Optimistic like state by id (what the user asked for).
    var trackLikes: [String: Bool] = [:]
    var albumLikes: [String: Bool] = [:]
    /// Last like state the server confirmed in this session.
    @ObservationIgnored var confirmedTrackLikes: [String: Bool] = [:]
    @ObservationIgnored var confirmedAlbumLikes: [String: Bool] = [:]
    @ObservationIgnored var likesInFlight: Set<String> = []

    let api: APIClient

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

        // The catalogue is the server truth for every track's like state; record
        // it so screens holding older copies of a track still show the right
        // heart. Items with a like request in flight keep the user's wish.
        if case .success(let all) = tracksResult {
            for track in all where !likesInFlight.contains(track.id) {
                trackLikes[track.id] = track.likedByMe
                confirmedTrackLikes[track.id] = track.likedByMe
            }
        }
        if case .success(let all) = albumsResult {
            for album in all where !likesInFlight.contains("album:" + album.id) {
                albumLikes[album.id] = album.likedByMe
                confirmedAlbumLikes[album.id] = album.likedByMe
            }
        }
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
        message = nil
        trackLikes = [:]
        albumLikes = [:]
        confirmedTrackLikes = [:]
        confirmedAlbumLikes = [:]
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
