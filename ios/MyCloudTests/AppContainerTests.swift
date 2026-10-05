import XCTest
@testable import MyCloud

@MainActor
final class AppContainerTests: XCTestCase {
    /// A 401 on any authenticated call (token expired after 7 days) must take
    /// the user back to the login screen.
    func testRejectedTokenSignsOutSession() async throws {
        let suite = "AppContainerTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        let container = AppContainer(
            config: AppConfig(apiBaseURL: URL(string: "https://music.dirty.baby:8443")!),
            tokenStorage: InMemorySecretStorage("t"),
            userCache: UserCache(defaults: defaults),
            urlSession: StubURLProtocol.makeSession()
        )
        let me = try Fixture.data("me")
        StubURLProtocol.respond { _ in .init(status: 200, body: me) }
        await container.session.restore()
        XCTAssertNotNil(container.session.currentUser)

        StubURLProtocol.respond { _ in .init(status: 401, body: .json(#"{"error":"Invalid token"}"#)) }
        _ = try? await container.api.send(API.Playlists.list())

        XCTAssertEqual(container.session.state, .signedOut)
        let token = await container.tokenStore.token
        XCTAssertNil(token)
    }
}
