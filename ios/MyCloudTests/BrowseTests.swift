import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import MyCloud

final class FormattingTests: XCTestCase {
    func testRussianPlural() {
        let forms = [0: "треков", 1: "трек", 2: "трека", 4: "трека", 5: "треков", 11: "треков",
                     12: "треков", 14: "треков", 21: "трек", 22: "трека", 25: "треков", 101: "трек", 111: "треков"]
        for (n, expected) in forms {
            XCTAssertEqual(RussianPlural.form(n, one: "трек", few: "трека", many: "треков"), expected, "n=\(n)")
        }
        XCTAssertEqual(Format.trackCount(3), "3 трека")
    }

    func testDuration() {
        XCTAssertEqual(Format.duration(0), "0:00")
        XCTAssertEqual(Format.duration(225.1), "3:45")
        XCTAssertEqual(Format.duration(3723), "1:02:03")
        XCTAssertNil(Format.duration(nil))
        XCTAssertNil(Format.duration(.nan))
        XCTAssertNil(Format.duration(-1))
    }

    func testTotalDuration() {
        XCTAssertEqual(Format.totalDuration(42 * 60), "42 мин")
        XCTAssertEqual(Format.totalDuration(65 * 60), "1 ч 5 мин")
        XCTAssertEqual(Format.totalDuration(120 * 60), "2 ч")
        XCTAssertEqual(Format.totalDuration(10), "1 мин")
    }
}

@MainActor
final class BrowseViewModelTests: XCTestCase {
    private func makeAPI(token: String? = "t") -> APIClient {
        APIClient(baseURL: URL(string: "https://music.dirty.baby:8443")!,
                  session: StubURLProtocol.makeSession(),
                  tokenProvider: { token }, unauthorizedHandler: { _ in })
    }

    private func routes(_ map: [String: (Int, Data)]) {
        StubURLProtocol.respond { request in
            guard let (status, body) = map[request.url?.path ?? ""] else {
                return .init(status: 404, body: .json(#"{"error":"Not found"}"#))
            }
            return .init(status: status, body: body)
        }
    }

    // MARK: Home

    func testHomeShowsAvailableSectionsWhenOneFails() async throws {
        routes([
            "/api/daily-playlist": (200, try Fixture.data("daily_playlist")),
            "/api/albums": (200, try Fixture.data("albums")),
            "/api/recommendations": (500, .json(#"{"error":"boom"}"#)),
        ])
        let viewModel = HomeViewModel(api: makeAPI())
        await viewModel.load()
        let content = try XCTUnwrap(viewModel.state.value)
        XCTAssertFalse(try XCTUnwrap(content.daily).tracks.isEmpty)
        XCTAssertFalse(content.newAlbums.isEmpty)
        XCTAssertTrue(content.genres.isEmpty)
    }

    func testHomeFailsOnlyWhenEverythingFails() async {
        StubURLProtocol.respond { _ in .init(status: 0, body: Data(), error: URLError(.notConnectedToInternet)) }
        let viewModel = HomeViewModel(api: makeAPI())
        await viewModel.load()
        guard case .failed(.offline) = viewModel.state else { return XCTFail("Got \(viewModel.state)") }
    }

    func testNewestAlbumsSkipsEmptyAndUnpublished() async throws {
        let albums = try Fixture.decode([Album].self, from: "albums")
        let json = Data.json(#"[{"id":"e","title":"Empty","artist":"a","status":"published","tracks":[]},"#
            + #"{"id":"p","title":"Pending","artist":"a","status":"pending","tracks":[{"id":"t","title":"T"}]}]"#)
        let extra = try APIClient.makeDecoder().decode([Album].self, from: json)
        let newest = HomeViewModel.newestAlbums(albums + extra)
        XCTAssertEqual(Set(newest.map(\.id)), Set(albums.filter { !($0.tracks?.isEmpty ?? true) }.map(\.id)))
    }

    // MARK: Search

    func testSearchDebouncesAndLoads() async throws {
        let body = try Fixture.data("search")
        routes(["/api/search": (200, body)])
        let viewModel = SearchViewModel(api: makeAPI())
        viewModel.query = "  rock  "
        await viewModel.search()
        XCTAssertEqual(viewModel.resultsQuery, "rock")
        XCTAssertFalse(try XCTUnwrap(viewModel.state.value).isEmpty)
        let query = StubURLProtocol.requests.first?.url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }
        XCTAssertEqual(query?.queryItems?.first?.value, "rock")
    }

    func testSearchCancelledDuringDebounceSendsNothing() async {
        routes([:])
        let viewModel = SearchViewModel(api: makeAPI())
        viewModel.query = "a"
        let task = Task { await viewModel.search() }
        task.cancel()
        await task.value
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
    }

    func testEmptyQueryResets() async {
        let viewModel = SearchViewModel(api: makeAPI())
        viewModel.query = "   "
        await viewModel.search()
        guard case .idle = viewModel.state else { return XCTFail("Expected idle") }
    }

    func testScopeFilter() async throws {
        let results = try Fixture.decode(SearchResults.self, from: "search")
        let viewModel = SearchViewModel(api: makeAPI())
        viewModel.scope = .artists
        let filtered = viewModel.filtered(results)
        XCTAssertTrue(filtered.tracks.isEmpty && filtered.albums.isEmpty)
        XCTAssertEqual(filtered.artists.count, results.artists.count)
    }

    // MARK: Album / artist

    func testAlbumLoads() async throws {
        routes(["/api/albums/abc": (200, try Fixture.data("album"))])
        let viewModel = AlbumViewModel(albumID: "abc", api: makeAPI())
        await viewModel.load()
        XCTAssertNotNil(viewModel.state.value)
    }

    func testAlbumNotFound() async {
        routes([:])
        let viewModel = AlbumViewModel(albumID: "missing", api: makeAPI())
        await viewModel.load()
        guard case .failed(.notFound) = viewModel.state else { return XCTFail("Got \(viewModel.state)") }
    }

    func testArtistPopularTracksSortedByPlays() async throws {
        routes(["/api/users/Heroinwater": (200, try Fixture.data("profile"))])
        let viewModel = ArtistViewModel(username: "Heroinwater", api: makeAPI())
        await viewModel.load()
        let profile = try XCTUnwrap(viewModel.state.value)
        let popular = ArtistViewModel.popularTracks(profile)
        XCTAssertEqual(popular.map(\.playsCount), popular.map(\.playsCount).sorted(by: >))
    }

    // MARK: Library

    func testLibraryFiltersLikedItems() async throws {
        let tracks = Data.json(#"[{"id":"1","title":"A","artist":"x","likedByMe":true},{"id":"2","title":"B","artist":"x"}]"#)
        let albums = Data.json(#"[{"id":"a","title":"Al","artist":"x","likedByMe":true},{"id":"b","title":"Bl","artist":"x"}]"#)
        routes([
            "/api/tracks": (200, tracks),
            "/api/albums": (200, albums),
            "/api/playlists": (200, try Fixture.data("playlists")),
        ])
        let library = LibraryStore(api: makeAPI())
        await library.load()
        XCTAssertEqual(library.likedTracks.value?.map(\.id), ["1"])
        XCTAssertEqual(library.likedAlbums.value?.map(\.id), ["a"])
        let playlist = try XCTUnwrap(library.playlists.value?.first)
        XCTAssertEqual(library.playlist(id: playlist.id)?.name, "Fixture")

        library.reset()
        XCTAssertFalse(library.hasLoaded)
    }
}

final class ListenRecorderTests: XCTestCase {
    private func makeAPI() -> APIClient {
        APIClient(baseURL: URL(string: "https://music.dirty.baby:8443")!,
                  session: StubURLProtocol.makeSession(),
                  tokenProvider: { "t" }, unauthorizedHandler: { _ in })
    }

    func testReportPostsListen() async throws {
        StubURLProtocol.respond { _ in .init(status: 200, body: .json(#"{"ok":true,"playsCount":3}"#)) }
        let response = try await ListenRecorder.report("abc", api: makeAPI())
        XCTAssertEqual(response.playsCount, 3)
        let request = try XCTUnwrap(StubURLProtocol.requests.last)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/tracks/listen")
        let body = try XCTUnwrap(request.httpBody ?? request.bodyStreamData)
        XCTAssertEqual(try JSONSerialization.jsonObject(with: body) as? [String: String], ["trackId": "abc"])
    }

    func testLiveRecorderSendsFromBackground() async throws {
        let sent = expectation(description: "listen request")
        StubURLProtocol.respond { request in
            if request.url?.path == "/api/tracks/listen" { sent.fulfill() }
            return .init(status: 200, body: .json(#"{"ok":true,"playsCount":1}"#))
        }
        ListenRecorder.live(api: makeAPI()).record("abc")
        let result = await XCTWaiter().fulfillment(of: [sent], timeout: 10)
        XCTAssertEqual(result, .completed,
                       "Seen requests: \(StubURLProtocol.requests.map { "\($0.httpMethod ?? "") \($0.url?.absoluteString ?? "")" })")
    }
}

@MainActor
final class WaveformTests: XCTestCase {
    func testBucketsKeepPeaksAndClamp() async {
        XCTAssertEqual(Waveform.buckets([0.1, 0.9, 0.2, 0.3], count: 2), [0.9, 0.3])
        XCTAssertEqual(Waveform.buckets([0.5, 2, -1, .nan], count: 4), [0.5, 1, 0, 0])
        XCTAssertEqual(Waveform.buckets([0.4], count: 3), [0.4, 0.4, 0.4])
        XCTAssertTrue(Waveform.buckets([], count: 10).isEmpty)
        XCTAssertTrue(Waveform.buckets([0.1], count: 0).isEmpty)
    }

    func testDecodesRealWaveform() async throws {
        let waveform = try Fixture.decode(Waveform.self, from: "waveform")
        XCTAssertEqual(waveform.samples.count, 200)
        XCTAssertEqual(Waveform.buckets(waveform.samples, count: 70).count, 70)
    }

    func testStoreKeepsOnlyRealWaveforms() async throws {
        let api = APIClient(baseURL: URL(string: "https://music.dirty.baby:8443")!,
                            session: StubURLProtocol.makeSession(),
                            tokenProvider: { nil }, unauthorizedHandler: { _ in })
        let store = WaveformStore(api: api)
        let track = try JSONDecoder().decode(Track.self, from: .json(
            #"{"id":"t1","title":"T","artist":"A","waveformUrl":"/api/waveform/t1"}"#))

        StubURLProtocol.respond { _ in .init(status: 200, body: .json(#"{"samples":[],"duration":0}"#)) }
        await store.load(for: track)
        XCTAssertNil(store.samples(for: track), "Still generating: must be retried later")

        let real = try Fixture.data("waveform")
        StubURLProtocol.respond { _ in .init(status: 200, body: real) }
        await store.load(for: track)
        XCTAssertEqual(store.samples(for: track)?.count, 200)
        XCTAssertNil(StubURLProtocol.requests.last?.value(forHTTPHeaderField: "Authorization"))

        let noWaveform = try JSONDecoder().decode(Track.self, from: .json(#"{"id":"t2","title":"T","artist":"A"}"#))
        await store.load(for: noWaveform)
        XCTAssertNil(store.samples(for: noWaveform))
    }
}
