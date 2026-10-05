import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import MyCloud

@MainActor
final class SessionStoreTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() async throws {
        suiteName = "SessionStoreTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() async throws {
        defaults.removePersistentDomain(forName: suiteName)
    }

    private func makeSession(token: String?) -> (SessionStore, TokenStore, UserCache) {
        let tokenStore = TokenStore(storage: InMemorySecretStorage(token))
        let api = APIClient(baseURL: URL(string: "https://music.dirty.baby:8443")!,
                            session: StubURLProtocol.makeSession(),
                            tokenProvider: { await tokenStore.token },
                            unauthorizedHandler: { await tokenStore.clear(ifEqualTo: $0) })
        let cache = UserCache(defaults: defaults)
        return (SessionStore(api: api, tokenStore: tokenStore, userCache: cache), tokenStore, cache)
    }

    /// Routes stubbed requests by path to fixture names.
    private func stubRoutes(_ routes: [String: (Int, String)]) {
        let bodies = routes.mapValues { status, fixture in (status, (try? Fixture.data(fixture)) ?? Data()) }
        StubURLProtocol.respond { request in
            guard let (status, body) = bodies[request.url?.path ?? ""] else {
                return .init(status: 404, body: .json(#"{"error":"Not found"}"#))
            }
            return .init(status: status, body: body)
        }
    }

    // MARK: Restore

    func testRestoreWithoutTokenSignsOut() async {
        let (session, _, _) = makeSession(token: nil)
        StubURLProtocol.respond { _ in .init(status: 500, body: Data()) }
        await session.restore()
        XCTAssertEqual(session.state, .signedOut)
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
    }

    func testRestoreWithValidToken() async throws {
        let (session, _, cache) = makeSession(token: "t")
        stubRoutes(["/api/auth/me": (200, "me")])
        await session.restore()
        XCTAssertEqual(session.currentUser?.username, "fixture_user")
        XCTAssertEqual(cache.load()?.username, "fixture_user")
    }

    func testRestoreWithRejectedTokenSignsOutAndClearsToken() async {
        let (session, tokenStore, cache) = makeSession(token: "expired")
        cache.save(CurrentUser(SessionUser(id: "1", username: "old", role: "user", accountType: "listener")))
        StubURLProtocol.respond { _ in .init(status: 401, body: .json(#"{"error":"Invalid token"}"#)) }
        await session.restore()
        XCTAssertEqual(session.state, .signedOut)
        let token = await tokenStore.token
        XCTAssertNil(token)
        XCTAssertNil(cache.load())
    }

    func testRestoreOfflineUsesCachedUser() async {
        let (session, tokenStore, cache) = makeSession(token: "t")
        cache.save(CurrentUser(SessionUser(id: "1", username: "cached", role: "user", accountType: "listener")))
        StubURLProtocol.respond { _ in .init(status: 0, body: Data(), error: URLError(.notConnectedToInternet)) }
        await session.restore()
        XCTAssertEqual(session.currentUser?.username, "cached")
        let token = await tokenStore.token
        XCTAssertEqual(token, "t", "Being offline must not sign the user out")
    }

    func testRestoreOfflineWithoutCacheShowsLogin() async {
        let (session, _, _) = makeSession(token: "t")
        StubURLProtocol.respond { _ in .init(status: 0, body: Data(), error: URLError(.notConnectedToInternet)) }
        await session.restore()
        XCTAssertEqual(session.state, .signedOut)
    }

    // MARK: Login / register / sign out

    func testLoginStoresTokenAndLoadsProfile() async throws {
        let (session, tokenStore, _) = makeSession(token: nil)
        stubRoutes(["/api/auth/login": (200, "register"), "/api/auth/me": (200, "me")])
        try await session.login(username: "fixture_user", password: "secret12")
        let token = await tokenStore.token
        XCTAssertEqual(token, "test-token")
        XCTAssertEqual(session.currentUser?.username, "fixture_user")
        let meRequest = StubURLProtocol.requests.first { $0.url?.path == "/api/auth/me" }
        XCTAssertEqual(meRequest?.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
    }

    func testLoginFailureKeepsSignedOut() async {
        let (session, tokenStore, _) = makeSession(token: nil)
        await session.restore()
        stubRoutes(["/api/auth/login": (401, "login_fail")])
        do {
            try await session.login(username: "fixture_user", password: "bad")
            XCTFail("Expected failure")
        } catch {
            XCTAssertEqual(error as? APIError, .unauthorized(message: "Invalid credentials"))
        }
        XCTAssertEqual(session.state, .signedOut)
        let token = await tokenStore.token
        XCTAssertNil(token)
    }

    func testRegisterSendsListenerAccount() async throws {
        let (session, _, _) = makeSession(token: nil)
        stubRoutes(["/api/auth/register": (200, "register"), "/api/auth/me": (200, "me")])
        try await session.register(username: "fixture_user", password: "secret12")
        let request = try XCTUnwrap(StubURLProtocol.requests.first { $0.url?.path == "/api/auth/register" })
        let body = try XCTUnwrap(request.httpBody ?? request.bodyStreamData)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json["accountType"], "listener")
        XCTAssertNotNil(session.currentUser)
    }

    func testLoginStillSucceedsIfProfileFetchFails() async throws {
        let (session, _, _) = makeSession(token: nil)
        stubRoutes(["/api/auth/login": (200, "register")])  // /me → 404
        try await session.login(username: "fixture_user", password: "secret12")
        XCTAssertEqual(session.currentUser?.username, "fixture_user")
    }

    func testSignOutClearsEverything() async throws {
        let (session, tokenStore, cache) = makeSession(token: "t")
        stubRoutes(["/api/auth/me": (200, "me")])
        await session.restore()
        await session.signOut()
        XCTAssertEqual(session.state, .signedOut)
        let token = await tokenStore.token
        XCTAssertNil(token)
        XCTAssertNil(cache.load())
    }
}

final class AuthValidationTests: XCTestCase {
    private func check(_ mode: AuthViewModel.Mode, _ user: String, _ pass: String, _ confirm: String = "") -> String? {
        AuthViewModel.validate(mode: mode, username: user, password: pass, confirmation: confirm)
    }

    func testLogin() {
        XCTAssertNil(check(.login, "", ""))
        XCTAssertNotNil(check(.login, "ab", "pass"))
        XCTAssertNil(check(.login, "abc", "x"), "Login doesn't enforce sign-up rules on old accounts")
        XCTAssertNil(check(.login, "Кириллица", "pass"))
    }

    func testRegister() {
        XCTAssertNil(check(.register, "new_user.1", "pass", "pass"))
        XCTAssertNotNil(check(.register, "new user", "pass", "pass"))
        XCTAssertNotNil(check(.register, "a/b", "pass", "pass"))
        XCTAssertNotNil(check(.register, "user", "abc", "abc"))
        XCTAssertNotNil(check(.register, "user", "pass", "pas"))
        XCTAssertNotNil(check(.register, "user", "pass", ""))
        XCTAssertNotNil(check(.register, String(repeating: "a", count: 33), "pass", "pass"))
    }
}

extension URLRequest {
    /// URLProtocol often sees the body as a stream rather than `httpBody`.
    var bodyStreamData: Data? {
        guard let stream = httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: buffer.count)
            guard read > 0 else { break }
            data.append(buffer, count: read)
        }
        return data
    }
}
