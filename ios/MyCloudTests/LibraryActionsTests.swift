import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import MyCloud

/// A fake server whose like endpoint really *toggles*, like the Express one.
private final class ToggleServer: @unchecked Sendable {
    private let lock = NSLock()
    private var liked: Bool
    private(set) var toggles = 0
    var fails = false

    init(liked: Bool) { self.liked = liked }

    var state: Bool { lock.withLock { liked } }
    var toggleCount: Int { lock.withLock { toggles } }

    func handle(_ request: URLRequest) -> StubURLProtocol.Stub {
        lock.withLock {
            if fails { return .init(status: 0, body: Data(), error: URLError(.notConnectedToInternet)) }
            liked.toggle()
            toggles += 1
            return .init(status: 200, body: .json(#"{"likesCount":\#(liked ? 1 : 0),"likedByMe":\#(liked)}"#))
        }
    }
}

@MainActor
final class LibraryActionsTests: XCTestCase {
    private func makeLibrary() -> LibraryStore {
        LibraryStore(api: APIClient(baseURL: URL(string: "https://music.dirty.baby:8443")!,
                                    session: StubURLProtocol.makeSession(),
                                    tokenProvider: { "t" }, unauthorizedHandler: { _ in }))
    }

    private func track(liked: Bool = false) throws -> Track {
        try JSONDecoder().decode(Track.self, from: .json(#"{"id":"t1","title":"T","artist":"A","likedByMe":\#(liked)}"#))
    }

    func testLikeIsOptimisticAndConfirmed() async throws {
        let server = ToggleServer(liked: false)
        StubURLProtocol.respond(server.handle)
        let library = makeLibrary()
        let track = try track()

        let task = Task { await library.setLiked(true, track: track) }
        // Let the task run up to its first network await.
        for _ in 0..<20 where !library.isLiked(track) { await Task.yield() }
        XCTAssertTrue(library.isLiked(track), "UI updates before the server answers")
        await task.value

        XCTAssertTrue(library.isLiked(track))
        XCTAssertTrue(server.state)
        XCTAssertEqual(server.toggleCount, 1)
    }

    func testDoubleTapEndsInLastRequestedState() async throws {
        let server = ToggleServer(liked: false)
        StubURLProtocol.respond(server.handle)
        let library = makeLibrary()
        let track = try track()

        let first = Task { await library.setLiked(true, track: track) }
        let second = Task { await library.setLiked(false, track: track) }
        await first.value
        await second.value

        XCTAssertFalse(library.isLiked(track))
        XCTAssertFalse(server.state, "Server must end up matching the last tap")
    }

    func testFailureRollsBackAndReports() async throws {
        let server = ToggleServer(liked: false)
        server.fails = true
        StubURLProtocol.respond(server.handle)
        let library = makeLibrary()
        let track = try track()

        await library.setLiked(true, track: track)
        XCTAssertFalse(library.isLiked(track))
        XCTAssertEqual(library.message, APIError.offline.localizedDescription)
    }

    func testLikedListFollowsLikes() async throws {
        StubURLProtocol.respond { request in
            switch request.url?.path {
            case "/api/tracks": return .init(status: 200, body: .json("[]"))
            case "/api/albums": return .init(status: 200, body: .json("[]"))
            case "/api/playlists": return .init(status: 200, body: .json("[]"))
            default: return .init(status: 200, body: .json(#"{"likesCount":1,"likedByMe":true}"#))
            }
        }
        let library = makeLibrary()
        await library.load()
        await library.setLiked(true, track: try track())
        XCTAssertEqual(library.likedTracks.value?.map(\.id), ["t1"])
    }

    func testCatalogueRefreshUpdatesLikeStateEverywhere() async throws {
        StubURLProtocol.respond { request in
            switch request.url?.path {
            case "/api/tracks":
                return .init(status: 200, body: .json(#"[{"id":"t1","title":"T","artist":"A","likedByMe":true}]"#))
            default:
                return .init(status: 200, body: .json("[]"))
            }
        }
        let library = makeLibrary()
        let staleCopy = try track(liked: false)  // e.g. held by the Home screen
        await library.load()
        XCTAssertTrue(library.isLiked(staleCopy))
    }

    // MARK: Playlists

    func testCreateAddRemoveDeletePlaylist() async throws {
        let created = try Fixture.data("playlist_add")
        StubURLProtocol.respond { request in
            switch (request.httpMethod, request.url?.path) {
            case ("GET", "/api/playlists"): return .init(status: 200, body: .json("[]"))
            case ("POST", "/api/playlists"): return .init(status: 200, body: created)
            case ("POST", _): return .init(status: 200, body: created)
            default: return .init(status: 200, body: .json(#"{"success":true}"#))
            }
        }
        let library = makeLibrary()
        await library.reloadPlaylists()

        let createdPlaylist = await library.createPlaylist(name: "  Fixture  ", description: " ")
        let playlist = try XCTUnwrap(createdPlaylist)
        XCTAssertEqual(library.playlists.value?.count, 1)
        let createRequest = try XCTUnwrap(StubURLProtocol.requests.first { $0.httpMethod == "POST" })
        let body = try XCTUnwrap(createRequest.httpBody ?? createRequest.bodyStreamData)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["name"] as? String, "Fixture")
        XCTAssertNil(json["description"] as? String, "Blank description is not sent")

        let track = try XCTUnwrap(playlist.tracks.first)
        let alreadyThere = await library.add(track, to: playlist)
        XCTAssertTrue(alreadyThere)
        XCTAssertNotNil(library.message)

        await library.remove(track, from: playlist)
        XCTAssertEqual(library.playlist(id: playlist.id)?.tracks.count, 0)

        let deleted = await library.deletePlaylist(playlist)
        XCTAssertTrue(deleted)
        XCTAssertEqual(library.playlists.value?.count, 0)
    }

    func testRemoveFromPlaylistRestoresOnFailure() async throws {
        let created = try Fixture.data("playlist_add")
        StubURLProtocol.respond { request in
            if request.httpMethod == "DELETE" {
                return .init(status: 500, body: .json(#"{"error":"boom"}"#))
            }
            return .init(status: 200, body: request.httpMethod == "GET" ? .json("[]") : created)
        }
        let library = makeLibrary()
        let createdPlaylist = await library.createPlaylist(name: "Fixture", description: nil)
        let playlist = try XCTUnwrap(createdPlaylist)
        let track = try XCTUnwrap(playlist.tracks.first)
        await library.remove(track, from: playlist)
        XCTAssertEqual(library.playlist(id: playlist.id)?.tracks.count, 1)
        XCTAssertNotNil(library.message)
    }

    func testEmptyNameIsRejectedLocally() async {
        StubURLProtocol.respond { _ in .init(status: 500, body: Data()) }
        let library = makeLibrary()
        let created = await library.createPlaylist(name: "   ", description: nil)
        XCTAssertNil(created)
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
    }
}
