import Foundation

enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
}

enum AuthRequirement: Sendable {
    /// Never send the token.
    case none
    /// Send the token if we have one (server personalises e.g. `likedByMe`).
    case optional
    /// Fail with `.unauthorized` locally if there's no token.
    case required
}

/// A typed description of one backend call. `Response` is what a 2xx body decodes to.
struct Endpoint<Response: Decodable>: Sendable {
    var method: HTTPMethod
    /// Path segments after the base URL, unescaped: `["api", "users", username]`.
    var pathSegments: [String]
    var query: [URLQueryItem] = []
    var body: Data?
    var auth: AuthRequirement

    init(
        _ method: HTTPMethod,
        _ pathSegments: [String],
        query: [URLQueryItem] = [],
        body: Data? = nil,
        auth: AuthRequirement
    ) {
        self.method = method
        self.pathSegments = pathSegments
        self.query = query
        self.body = body
        self.auth = auth
    }

    /// Percent-encodes each segment separately, so a `/` or `?` inside a
    /// username can never change the route.
    var percentEncodedPath: String {
        "/" + pathSegments
            .map { $0.addingPercentEncoding(withAllowedCharacters: .pathSegmentAllowed) ?? $0 }
            .joined(separator: "/")
    }
}

extension Endpoint {
    static func jsonBody<Body: Encodable>(_ body: Body) -> Data {
        // Encoding plain [String: String]-like structs cannot fail.
        (try? JSONEncoder().encode(body)) ?? Data()
    }
}

/// For endpoints whose body we don't need (`{ "success": true }`, `{ "ok": true }`).
struct EmptyResponse: Decodable, Sendable {}

extension CharacterSet {
    static let pathSegmentAllowed: CharacterSet = {
        var set = CharacterSet.urlPathAllowed
        set.remove(charactersIn: "/;")
        return set
    }()
}
