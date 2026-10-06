import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import MyCloud

private func temporaryDirectory() -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("mycloud-tests-\(UUID().uuidString)", isDirectory: true)
}

private func makeAPI(cache: ResponseCache? = nil) -> APIClient {
    APIClient(baseURL: URL(string: "https://music.dirty.baby:8443")!,
              session: StubURLProtocol.makeSession(),
              responseCache: cache,
              tokenProvider: { "t" }, unauthorizedHandler: { _ in })
}

private func track(_ id: String, title: String = "Track") throws -> Track {
    try JSONDecoder().decode(Track.self, from: .json(#"{"id":"\#(id)","title":"\#(title)","artist":"Artist","genre":"Rock"}"#))
}

// MARK: - Response cache

final class ResponseCacheTests: XCTestCase {
    func testStoreLoadAndOwnerSwitch() async throws {
        let cache = ResponseCache(directory: temporaryDirectory())
        await cache.activate(ownerID: "alice")
        await cache.store(.json("[1]"), for: "GET /api/tracks?")
        let stored = await cache.data(for: "GET /api/tracks?")
        XCTAssertEqual(stored, .json("[1]"))

        await cache.activate(ownerID: "alice")
        let sameOwner = await cache.data(for: "GET /api/tracks?")
        XCTAssertNotNil(sameOwner, "Re-signing in as the same user keeps the cache")

        await cache.activate(ownerID: "bob")
        let otherOwner = await cache.data(for: "GET /api/tracks?")
        XCTAssertNil(otherOwner, "Another user's data must never be shown")
    }

    func testOwnerSurvivesRelaunch() async throws {
        let directory = temporaryDirectory()
        let first = ResponseCache(directory: directory)
        await first.activate(ownerID: "alice")
        await first.store(.json("{}"), for: "k")

        let relaunched = ResponseCache(directory: directory)
        await relaunched.activate(ownerID: "alice")
        let data = await relaunched.data(for: "k")
        XCTAssertNotNil(data)
    }

    func testFileNameIsStableAndSafe() {
        let name = ResponseCache.fileName(for: "GET /api/users/a%2Fb?")
        XCTAssertEqual(name, ResponseCache.fileName(for: "GET /api/users/a%2Fb?"))
        XCTAssertFalse(name.contains("/"))
        XCTAssertNotEqual(name, ResponseCache.fileName(for: "GET /api/users/c?"))
    }
}

final class APICacheTests: XCTestCase {
    func testOnlyGETCanBeCacheable() {
        XCTAssertTrue(API.Catalog.tracks().isCacheable)
        XCTAssertFalse(API.Catalog.search("x").isCacheable)
        XCTAssertFalse(API.Library.toggleTrackLike(id: "1").cacheable().isCacheable)
    }

    func testFallsBackToCacheWhenOffline() async throws {
        let cache = ResponseCache(directory: temporaryDirectory())
        let api = makeAPI(cache: cache)
        let body = try Fixture.data("tracks")

        StubURLProtocol.respond { _ in .init(status: 200, body: body) }
        let fresh = try await api.sendOrCached(API.Catalog.tracks())
        XCTAssertFalse(fresh.isCached)

        StubURLProtocol.respond { _ in .init(status: 0, body: Data(), error: URLError(.notConnectedToInternet)) }
        let offline = try await api.sendOrCached(API.Catalog.tracks())
        XCTAssertTrue(offline.isCached)
        XCTAssertEqual(offline.value.map(\.id), fresh.value.map(\.id))
    }

    func testAuthAndNotFoundAreNeverMaskedByCache() async throws {
        let cache = ResponseCache(directory: temporaryDirectory())
        let api = makeAPI(cache: cache)
        let body = try Fixture.data("album")
        StubURLProtocol.respond { _ in .init(status: 200, body: body) }
        _ = try await api.send(API.Catalog.album(id: "a"))

        for (status, expected) in [(401, APIError.unauthorized(message: "x")), (404, .notFound(message: "x"))] {
            StubURLProtocol.respond { _ in .init(status: status, body: .json(#"{"error":"x"}"#)) }
            do {
                _ = try await api.sendOrCached(API.Catalog.album(id: "a"))
                XCTFail("Expected \(expected)")
            } catch {
                XCTAssertEqual(error as? APIError, expected)
            }
        }
    }

    func testOfflineWithoutCacheStillFails() async {
        let api = makeAPI(cache: ResponseCache(directory: temporaryDirectory()))
        StubURLProtocol.respond { _ in .init(status: 0, body: Data(), error: URLError(.notConnectedToInternet)) }
        do {
            _ = try await api.sendOrCached(API.Catalog.tracks())
            XCTFail("Expected failure")
        } catch {
            XCTAssertEqual(error as? APIError, .offline)
        }
    }
}

// MARK: - Downloads

@MainActor
final class DownloadStoreTests: XCTestCase {
    private var directory: URL!

    override func setUp() async throws {
        directory = temporaryDirectory()
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: directory)
    }

    /// swift-corelibs-foundation crashes in `URLSession.download(for:delegate:)`
    /// with a custom URLProtocol; these run on Apple platforms (CI simulator).
    private func skipOnLinux() throws {
        #if os(Linux)
        throw XCTSkip("URLSession downloads with URLProtocol stubs crash on Linux Foundation")
        #endif
    }

    private func makeStore() -> DownloadStore {
        DownloadStore(api: makeAPI(), directory: directory, session: StubURLProtocol.makeSession())
    }

    private func waitUntilIdle(_ store: DownloadStore) async {
        for _ in 0..<200 where store.activeCount > 0 {
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    func testDownloadSavesFilePersistsAndPlaysLocally() async throws {
        try skipOnLinux()
        let audio = Data(repeating: 7, count: 4096)
        StubURLProtocol.respond { _ in .init(status: 200, body: audio, headers: ["Content-Type": "audio/mpeg"]) }
        let store = makeStore()
        store.activate(ownerID: "alice")
        let song = try track("t1")

        store.download([song])
        XCTAssertNotNil(store.state(for: "t1"))
        await waitUntilIdle(store)

        XCTAssertTrue(store.isDownloaded("t1"))
        let local = try XCTUnwrap(store.localURL(for: song))
        XCTAssertEqual(local.pathExtension, "mp3")
        XCTAssertEqual(try Data(contentsOf: local), audio)
        XCTAssertEqual(store.totalBytes, 4096)

        // A relaunch restores the offline library from the index.
        let relaunched = makeStore()
        XCTAssertTrue(relaunched.isDownloaded("t1"))
        XCTAssertEqual(relaunched.downloadedTracks.map(\.id), ["t1"])
    }

    func testFileExtensionFollowsContentType() async {
        XCTAssertEqual(DownloadStore.fileExtension(for: "audio/mp4"), "m4a")
        XCTAssertEqual(DownloadStore.fileExtension(for: "audio/flac"), "flac")
        XCTAssertEqual(DownloadStore.fileExtension(for: nil), "mp3")
    }

    func testFailedDownloadIsReportedAndRetryable() async throws {
        try skipOnLinux()
        StubURLProtocol.respond { _ in .init(status: 404, body: .json(#"{"error":"Track not found"}"#)) }
        let store = makeStore()
        store.download([try track("missing")])
        await waitUntilIdle(store)
        guard case .failed = store.state(for: "missing") else { return XCTFail("Got \(String(describing: store.state(for: "missing")))") }
        XCTAssertNil(store.localURL(for: try track("missing")))

        StubURLProtocol.respond { _ in .init(status: 200, body: Data([1]), headers: ["Content-Type": "audio/mpeg"]) }
        store.download([try track("missing")])
        await waitUntilIdle(store)
        XCTAssertTrue(store.isDownloaded("missing"))
    }

    func testRemoveAndOwnerSwitch() async throws {
        try skipOnLinux()
        StubURLProtocol.respond { _ in .init(status: 200, body: Data([1, 2, 3]), headers: ["Content-Type": "audio/mpeg"]) }
        let store = makeStore()
        store.activate(ownerID: "alice")
        store.download([try track("a"), try track("b")])
        await waitUntilIdle(store)
        XCTAssertEqual(Set(store.downloadedTracks.map(\.id)), ["a", "b"])

        let fileA = try XCTUnwrap(store.localURL(for: try track("a")))
        store.remove("a")
        XCTAssertFalse(FileManager.default.fileExists(atPath: fileA.path))
        XCTAssertEqual(store.downloadedTracks.map(\.id), ["b"])

        store.activate(ownerID: "alice")
        XCTAssertEqual(store.downloadedTracks.map(\.id), ["b"], "Same user keeps downloads")
        store.activate(ownerID: "bob")
        XCTAssertTrue(store.downloadedTracks.isEmpty, "Another user's downloads are wiped")
    }

    func testDuplicateRequestsDownloadOnce() async throws {
        try skipOnLinux()
        let counter = RequestCounter()
        StubURLProtocol.respond { _ in
            counter.increment()
            return .init(status: 200, body: Data([1]), headers: ["Content-Type": "audio/mpeg"])
        }
        let store = makeStore()
        let song = try track("t1")
        store.download([song, song])
        store.download([song])
        await waitUntilIdle(store)
        store.download([song])
        await waitUntilIdle(store)
        XCTAssertEqual(counter.value, 1)
    }
}

private final class RequestCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    func increment() { lock.withLock { count += 1 } }
    var value: Int { lock.withLock { count } }
}

// MARK: - Offline UX

@MainActor
final class OfflineBehaviourTests: XCTestCase {
    func testSearchFallsBackToDownloadsOffline() async throws {
        StubURLProtocol.respond { _ in .init(status: 0, body: Data(), error: URLError(.notConnectedToInternet)) }
        let downloaded = [try track("1", title: "Мама я люблю"), try track("2", title: "Другой")]
        let viewModel = SearchViewModel(api: makeAPI()) { downloaded }
        viewModel.query = "мама"
        await viewModel.search()
        XCTAssertTrue(viewModel.isOfflineResults)
        XCTAssertEqual(viewModel.state.value?.tracks.map(\.id), ["1"])
    }

    func testSearchOfflineWithoutDownloadsShowsError() async {
        StubURLProtocol.respond { _ in .init(status: 0, body: Data(), error: URLError(.notConnectedToInternet)) }
        let viewModel = SearchViewModel(api: makeAPI())
        viewModel.query = "мама"
        await viewModel.search()
        guard case .failed(.offline) = viewModel.state else { return XCTFail("Got \(viewModel.state)") }
    }

    func testHomeShowsCachedContentOffline() async throws {
        let cache = ResponseCache(directory: temporaryDirectory())
        let api = makeAPI(cache: cache)
        let daily = try Fixture.data("daily_playlist")
        let albums = try Fixture.data("albums")
        let recommendations = try Fixture.data("recommendations")
        StubURLProtocol.respond { request in
            switch request.url?.path {
            case "/api/daily-playlist": return .init(status: 200, body: daily)
            case "/api/albums": return .init(status: 200, body: albums)
            default: return .init(status: 200, body: recommendations)
            }
        }
        await HomeViewModel(api: api).load()

        StubURLProtocol.respond { _ in .init(status: 0, body: Data(), error: URLError(.notConnectedToInternet)) }
        let offline = HomeViewModel(api: api)
        await offline.load()
        XCTAssertTrue(offline.isShowingCachedData)
        let content = try XCTUnwrap(offline.state.value)
        XCTAssertFalse(content.isEmpty)
    }

    func testStorageIsPreparedBeforeSignedInUIAppears() async throws {
        let tokenStore = TokenStore(storage: InMemorySecretStorage("t"))
        let suite = "OfflineBehaviourTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let session = SessionStore(api: makeAPI(), tokenStore: tokenStore, userCache: UserCache(defaults: defaults))

        var stateWhenPrepared: SessionStore.State?
        session.prepareForUser = { _ in stateWhenPrepared = session.state }
        let me = try Fixture.data("me")
        StubURLProtocol.respond { _ in .init(status: 200, body: me) }
        await session.restore()

        XCTAssertEqual(stateWhenPrepared, .restoring, "Storage must be ready before the signed-in UI")
        XCTAssertNotNil(session.currentUser)
    }
}
