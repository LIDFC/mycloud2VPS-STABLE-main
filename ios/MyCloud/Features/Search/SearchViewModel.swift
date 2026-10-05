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

    private let api: APIClient
    static let debounce: Duration = .milliseconds(300)

    init(api: APIClient) {
        self.api = api
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
            state = .loaded(results)
        } catch {
            guard let apiError = APIError(error), text == trimmedQuery else { return }
            state = .failed(apiError)
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
