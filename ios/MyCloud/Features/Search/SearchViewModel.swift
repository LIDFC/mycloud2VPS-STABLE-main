import Foundation
import Observation

@MainActor
@Observable
final class SearchViewModel {
    enum Scope: String, CaseIterable, Identifiable {
        case all, tracks, albums, artists
        var id: Self { self }

        var title: String {
            switch self {
            case .all: String(localized: "Все")
            case .tracks: String(localized: "Треки")
            case .albums: String(localized: "Альбомы")
            case .artists: String(localized: "Исполнители")
            }
        }
    }

    var query = ""
    var scope: Scope = .all
    private(set) var state: Loadable<SearchResults> = .idle
    /// The query `state` belongs to (results never show for a stale query).
    private(set) var resultsQuery = ""

    /// Results come from downloaded tracks because the network is unavailable.
    private(set) var isOfflineResults = false

    private let api: APIClient
    private let offlineTracks: @MainActor () -> [Track]
    static let debounce: Duration = .milliseconds(300)

    init(api: APIClient, offlineTracks: @escaping @MainActor () -> [Track] = { [] }) {
        self.api = api
        self.offlineTracks = offlineTracks
    }

    var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Driven by `.task(id: query)`: SwiftUI cancels the previous call on every
    /// keystroke, which gives debouncing and cancels stale requests for free.
    func search() async {
        let text = trimmedQuery
        guard !text.isEmpty else {
            state = .idle
            resultsQuery = ""
            return
        }
        do {
            try await Task.sleep(for: Self.debounce)
        } catch {
            return
        }
        if state.value == nil || resultsQuery != text { state = .loading }
        do {
            let results = try await api.send(API.Catalog.search(text))
            guard !Task.isCancelled, text == trimmedQuery else { return }
            resultsQuery = text
            isOfflineResults = false
            state = .loaded(results)
        } catch {
            guard let apiError = APIError(error), text == trimmedQuery else { return }
            let local = offlineTracks()
            if apiError.allowsCacheFallback, !local.isEmpty {
                // Offline: search what's on the device instead of failing.
                resultsQuery = text
                isOfflineResults = true
                state = .loaded(SearchResults(tracks: Self.match(text, in: local), artists: [], albums: []))
            } else {
                state = .failed(apiError)
            }
        }
    }

    /// Same fields the server searches: title, artist line, genre.
    static func match(_ query: String, in tracks: [Track]) -> [Track] {
        let needle = query.lowercased()
        return tracks.filter { track in
            [track.title, track.artistLine, track.genre ?? ""].contains { $0.lowercased().contains(needle) }
        }
    }

    func retry() async {
        resultsQuery = ""
        await search()
    }

    func filtered(_ results: SearchResults) -> SearchResults {
        switch scope {
        case .all: results
        case .tracks: SearchResults(tracks: results.tracks, artists: [], albums: [])
        case .albums: SearchResults(tracks: [], artists: [], albums: results.albums)
        case .artists: SearchResults(tracks: [], artists: results.artists, albums: [])
        }
    }
}
