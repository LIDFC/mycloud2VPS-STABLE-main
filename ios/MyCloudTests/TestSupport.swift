import Foundation
import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import MyCloud

enum Fixture {
    /// Real responses captured from the MyCloud backend (trimmed), in `Fixtures/`.
    static func data(_ name: String, file: StaticString = #filePath, line: UInt = #line) throws -> Data {
        // Xcode flattens the folder into the bundle root; SwiftPM keeps `Fixtures/`.
        let url = try XCTUnwrap(
            bundle.url(forResource: name, withExtension: "json")
                ?? bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"),
            "Missing fixture \(name).json", file: file, line: line)
        return try Data(contentsOf: url)
    }

    static func decode<T: Decodable>(_ type: T.Type, from name: String) throws -> T {
        try APIClient.makeDecoder().decode(T.self, from: data(name))
    }

    private static var bundle: Bundle {
        #if SWIFT_PACKAGE
        return Bundle.module
        #else
        return Bundle(for: BundleToken.self)
        #endif
    }

    private final class BundleToken {}
}

/// Intercepts every request of a dedicated URLSession and answers from `handler`.
final class StubURLProtocol: URLProtocol {
    struct Stub {
        let status: Int
        let body: Data
        var error: URLError?
    }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var handler: ((URLRequest) -> Stub)?
    nonisolated(unsafe) private static var recorded: [URLRequest] = []

    static func respond(_ handler: @escaping (URLRequest) -> Stub) {
        lock.withLock {
            self.handler = handler
            recorded = []
        }
    }

    static var requests: [URLRequest] { lock.withLock { recorded } }

    static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let handler = Self.lock.withLock { () -> ((URLRequest) -> Stub)? in
            Self.recorded.append(request)
            return Self.handler
        }
        guard let handler, let url = request.url else {
            client?.urlProtocol(self, didFailWithError: URLError(.unknown))
            return
        }
        let stub = handler(request)
        if let error = stub.error {
            client?.urlProtocol(self, didFailWithError: error)
            return
        }
        let response = HTTPURLResponse(url: url, statusCode: stub.status, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

/// Records calls of the APIClient's unauthorized handler.
actor UnauthorizedRecorder {
    private(set) var rejectedTokens: [String] = []
    func record(_ token: String) { rejectedTokens.append(token) }
}

extension Data {
    static func json(_ string: String) -> Data { Data(string.utf8) }
}
