import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import MyCloud

final class APIClientTests: XCTestCase {
    private let baseURL = URL(string: "https://music.dirty.baby:8443")!

    private func makeClient(
        token: String? = "abc",
        recorder: UnauthorizedRecorder = UnauthorizedRecorder()
    ) -> APIClient {
        APIClient(
            baseURL: baseURL,
            session: StubURLProtocol.makeSession(),
            tokenProvider: { token },
            unauthorizedHandler: { await recorder.record($0) }
        )
    }

    // MARK: Request building

    func testBuildsURLAndEncodesPathSegments() throws {
        let client = makeClient()
        let request = try client.makeRequest(API.Catalog.profile(username: "a/b?c d"), token: nil)
        XCTAssertEqual(request.url?.absoluteString, "https://music.dirty.baby:8443/api/users/a%2Fb%3Fc%20d")
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
    }

    func testEncodesQuery() throws {
        let request = try makeClient().makeRequest(API.Catalog.search("рок & roll"), token: nil)
        let components = try XCTUnwrap(request.url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) })
        XCTAssertEqual(components.path, "/api/search")
        XCTAssertEqual(components.queryItems?.first?.value, "рок & roll")
    }

    func testBaseURLWithPathPrefix() throws {
        let client = APIClient(baseURL: URL(string: "https://example.com/mycloud/")!,
                               session: StubURLProtocol.makeSession(),
                               tokenProvider: { nil }, unauthorizedHandler: { _ in })
        let request = try client.makeRequest(API.health(), token: nil)
        XCTAssertEqual(request.url?.absoluteString, "https://example.com/mycloud/api/health")
    }

    func testJSONBodyAndAuthHeader() throws {
        let request = try makeClient().makeRequest(API.Auth.login(username: "u", password: "p"), token: "tok")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        let body = try XCTUnwrap(request.httpBody)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(object, ["username": "u", "password": "p"])
    }

    func testMediaURL() {
        let client = makeClient()
        XCTAssertEqual(client.mediaURL(for: "/uploads/covers/x.png")?.absoluteString,
                       "https://music.dirty.baby:8443/uploads/covers/x.png")
        XCTAssertEqual(client.mediaURL(for: "https://cdn.example.com/a.jpg")?.absoluteString,
                       "https://cdn.example.com/a.jpg")
        XCTAssertNil(client.mediaURL(for: nil))
        XCTAssertNil(client.mediaURL(for: ""))
    }

    // MARK: Responses

    func testDecodesSuccess() async throws {
        let body = try Fixture.data("tracks")
        StubURLProtocol.respond { _ in .init(status: 200, body: body) }
        let tracks = try await makeClient().send(API.Catalog.tracks())
        XCTAssertFalse(tracks.isEmpty)
        XCTAssertEqual(StubURLProtocol.requests.first?.value(forHTTPHeaderField: "Authorization"), "Bearer abc")
    }

    func testAuthNoneNeverSendsToken() async throws {
        StubURLProtocol.respond { _ in .init(status: 200, body: .json(#"{"ok":true,"uptime":1}"#)) }
        _ = try await makeClient(token: "abc").send(API.health())
        XCTAssertNil(StubURLProtocol.requests.first?.value(forHTTPHeaderField: "Authorization"))
    }

    func testRequiredAuthWithoutTokenFailsLocally() async {
        StubURLProtocol.respond { _ in .init(status: 200, body: .json("[]")) }
        do {
            _ = try await makeClient(token: nil).send(API.Playlists.list())
            XCTFail("Expected unauthorized")
        } catch {
            XCTAssertEqual(error as? APIError, .unauthorized(message: nil))
            XCTAssertTrue(StubURLProtocol.requests.isEmpty)
        }
    }

    func testServerErrorMessageIsSurfaced() async throws {
        let body = try Fixture.data("login_fail")
        StubURLProtocol.respond { _ in .init(status: 401, body: body) }
        let recorder = UnauthorizedRecorder()
        do {
            _ = try await makeClient(token: nil, recorder: recorder)
                .send(API.Auth.login(username: "u", password: "bad"))
            XCTFail("Expected failure")
        } catch {
            XCTAssertEqual(error as? APIError, .unauthorized(message: "Invalid credentials"))
            XCTAssertEqual((error as? APIError)?.localizedDescription, "Неверное имя пользователя или пароль")
        }
        // A failed login carried no token, so it must not trigger a sign-out.
        let rejected = await recorder.rejectedTokens
        XCTAssertTrue(rejected.isEmpty)
    }

    func testUnauthorizedWithTokenNotifiesHandler() async {
        StubURLProtocol.respond { _ in .init(status: 401, body: .json(#"{"error":"Invalid token"}"#)) }
        let recorder = UnauthorizedRecorder()
        do {
            _ = try await makeClient(token: "expired", recorder: recorder).send(API.Auth.me())
            XCTFail("Expected failure")
        } catch {
            XCTAssertEqual(error as? APIError, .unauthorized(message: "Invalid token"))
        }
        let rejected = await recorder.rejectedTokens
        XCTAssertEqual(rejected, ["expired"])
    }

    func testStatusMapping() async {
        let cases: [(Int, APIError)] = [
            (403, .forbidden(message: "Forbidden")),
            (404, .notFound(message: "Forbidden")),
            (500, .server(status: 500, message: "Forbidden")),
        ]
        for (status, expected) in cases {
            StubURLProtocol.respond { _ in .init(status: status, body: .json(#"{"error":"Forbidden"}"#)) }
            do {
                _ = try await makeClient().send(API.Catalog.album(id: "x"))
                XCTFail("Expected \(expected)")
            } catch {
                XCTAssertEqual(error as? APIError, expected)
            }
        }
    }

    func testHTMLErrorPageHasNoMessage() async {
        StubURLProtocol.respond { _ in .init(status: 502, body: .json("<html>Bad Gateway</html>")) }
        do {
            _ = try await makeClient().send(API.Catalog.tracks())
            XCTFail("Expected failure")
        } catch {
            let apiError = error as? APIError
            XCTAssertEqual(apiError, .server(status: 502, message: nil))
            XCTAssertEqual(apiError?.isRetryable, true)
        }
    }

    func testDecodingError() async {
        StubURLProtocol.respond { _ in .init(status: 200, body: .json(#"{"unexpected":true}"#)) }
        do {
            _ = try await makeClient().send(API.Catalog.tracks())
            XCTFail("Expected failure")
        } catch {
            guard case .decoding = error as? APIError else { return XCTFail("Got \(error)") }
        }
    }

    func testTransportErrorMapping() {
        XCTAssertEqual(APIClient.mapTransportError(URLError(.notConnectedToInternet)) as? APIError, .offline)
        XCTAssertEqual(APIClient.mapTransportError(URLError(.timedOut)) as? APIError, .timeout)
        XCTAssertEqual(APIClient.mapTransportError(URLError(.cannotConnectToHost)) as? APIError, .serverUnreachable)
        XCTAssertEqual(APIClient.mapTransportError(URLError(.serverCertificateUntrusted)) as? APIError, .secureConnectionFailed)
        XCTAssertTrue(APIClient.mapTransportError(URLError(.cancelled)) is CancellationError)
    }

    func testEmptyResponse() async throws {
        StubURLProtocol.respond { _ in .init(status: 200, body: .json(#"{"success":true}"#)) }
        _ = try await makeClient().send(API.Playlists.delete(id: "p1"))
        XCTAssertEqual(StubURLProtocol.requests.first?.httpMethod, "DELETE")
        XCTAssertEqual(StubURLProtocol.requests.first?.url?.path, "/api/playlists/p1")
    }
}
