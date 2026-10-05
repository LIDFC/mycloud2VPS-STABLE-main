import XCTest
@testable import MyCloud

final class TokenStoreTests: XCTestCase {
    func testSaveLoadClear() async throws {
        let storage = InMemorySecretStorage()
        let store = TokenStore(storage: storage)
        let initial = await store.token
        XCTAssertNil(initial)

        try await store.save("t1")
        let saved = await store.token
        XCTAssertEqual(saved, "t1")
        XCTAssertEqual(try storage.read(), "t1")

        await store.clear()
        let cleared = await store.token
        XCTAssertNil(cleared)
        XCTAssertNil(try storage.read())
    }

    func testLoadsExistingTokenFromStorage() async {
        let store = TokenStore(storage: InMemorySecretStorage("persisted"))
        let token = await store.token
        XCTAssertEqual(token, "persisted")
    }

    func testStaleRejectionDoesNotClearNewToken() async throws {
        let store = TokenStore(storage: InMemorySecretStorage("old"))
        try await store.save("new")
        let cleared = await store.clear(ifEqualTo: "old")
        XCTAssertFalse(cleared)
        let token = await store.token
        XCTAssertEqual(token, "new")

        let clearedCurrent = await store.clear(ifEqualTo: "new")
        XCTAssertTrue(clearedCurrent)
    }
}

final class AppConfigTests: XCTestCase {
    func testParsesBaseURL() {
        XCTAssertEqual(AppConfig(rawBaseURL: " https://music.dirty.baby:8443 ")?.apiBaseURL.absoluteString,
                       "https://music.dirty.baby:8443")
        XCTAssertNotNil(AppConfig(rawBaseURL: "http://192.168.1.10:3001"))
        XCTAssertNil(AppConfig(rawBaseURL: ""))
        XCTAssertNil(AppConfig(rawBaseURL: "$(API_BASE_URL)"))
        XCTAssertNil(AppConfig(rawBaseURL: "ftp://example.com"))
        XCTAssertNil(AppConfig(rawBaseURL: "music.dirty.baby"))
    }
}

final class APIErrorTests: XCTestCase {
    func testNormalisesErrors() {
        XCTAssertNil(APIError(CancellationError()))
        XCTAssertNil(APIError(URLError(.cancelled)))
        XCTAssertEqual(APIError(APIError.offline), .offline)
    }

    func testServerMessagesAreLocalized() {
        XCTAssertEqual(APIError.server(status: 409, message: "Username already taken").localizedDescription,
                       "Это имя пользователя уже занято")
        XCTAssertEqual(APIError.server(status: 400, message: "Some new message").localizedDescription,
                       "Some new message")
        XCTAssertFalse(APIError.server(status: 400, message: nil).isRetryable)
        XCTAssertTrue(APIError.server(status: 503, message: nil).isRetryable)
    }
}
