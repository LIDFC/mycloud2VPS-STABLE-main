import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Thin async/await client for the MyCloud Express API.
///
/// - Attaches the bearer token according to each endpoint's `AuthRequirement`.
/// - Maps transport failures and non-2xx responses to `APIError`.
/// - On a 401 for a request that carried a token, calls `unauthorizedHandler`
///   with that token so the session can sign out (only if it's still current).
final class APIClient: Sendable {
    let baseURL: URL

    private let session: URLSession
    private let tokenProvider: @Sendable () async -> String?
    private let unauthorizedHandler: @Sendable (_ rejectedToken: String) async -> Void
    let responseCache: ResponseCache?

    init(
        baseURL: URL,
        session: URLSession = APIClient.makeSession(),
        responseCache: ResponseCache? = nil,
        tokenProvider: @escaping @Sendable () async -> String?,
        unauthorizedHandler: @escaping @Sendable (_ rejectedToken: String) async -> Void
    ) {
        self.baseURL = baseURL
        self.session = session
        self.responseCache = responseCache
        self.tokenProvider = tokenProvider
        self.unauthorizedHandler = unauthorizedHandler
    }

    static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 60
        configuration.httpAdditionalHeaders = ["Accept": "application/json"]
        return URLSession(configuration: configuration)
    }

    // MARK: - Requests

    func send<Response>(_ endpoint: Endpoint<Response>) async throws -> Response {
        let token: String?
        switch endpoint.auth {
        case .none:
            token = nil
        case .optional:
            token = await tokenProvider()
        case .required:
            guard let current = await tokenProvider() else { throw APIError.unauthorized(message: nil) }
            token = current
        }

        let request = try makeRequest(endpoint, token: token)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Self.mapTransportError(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport(code: URLError.badServerResponse.rawValue)
        }

        guard (200..<300).contains(http.statusCode) else {
            let message = Self.serverMessage(from: data)
            if http.statusCode == 401, let token {
                await unauthorizedHandler(token)
            }
            throw Self.mapStatus(http.statusCode, message: message)
        }

        let value: Response
        do {
            value = try Self.makeDecoder().decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(details: String(describing: error))
        }
        if endpoint.isCacheable, let responseCache {
            await responseCache.store(data, for: endpoint.cacheKey)
        }
        return value
    }

    // MARK: - Cache

    /// The last successful response for a cacheable endpoint, if any.
    func cached<Response>(_ endpoint: Endpoint<Response>) async -> Response? {
        guard endpoint.isCacheable, let data = await responseCache?.data(for: endpoint.cacheKey) else { return nil }
        return try? Self.makeDecoder().decode(Response.self, from: data)
    }

    /// Network first; when the network (not the request) fails, falls back to
    /// the last cached response so screens keep working offline.
    /// - Returns: the value and whether it came from the cache.
    func sendOrCached<Response>(_ endpoint: Endpoint<Response>) async throws -> (value: Response, isCached: Bool) {
        do {
            return (try await send(endpoint), false)
        } catch let error as APIError where error.allowsCacheFallback {
            if let cached = await cached(endpoint) { return (cached, true) }
            throw error
        }
    }

    func makeRequest<Response>(_ endpoint: Endpoint<Response>, token: String?) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw APIError.invalidRequest(details: "Bad base URL \(baseURL)")
        }
        let basePath = components.percentEncodedPath.hasSuffix("/")
            ? String(components.percentEncodedPath.dropLast())
            : components.percentEncodedPath
        components.percentEncodedPath = basePath + endpoint.percentEncodedPath
        components.queryItems = endpoint.query.isEmpty ? nil : endpoint.query

        guard let url = components.url else {
            throw APIError.invalidRequest(details: "Bad path \(endpoint.pathSegments)")
        }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body = endpoint.body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    // MARK: - Media URLs

    /// Turns a server-relative path (`/uploads/covers/x.png`, `/api/stream/id`)
    /// into an absolute URL on the configured backend.
    func mediaURL(for path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        if let absolute = URL(string: path), absolute.scheme != nil { return absolute }
        return URL(string: path, relativeTo: baseURL)?.absoluteURL
    }

    // MARK: - Decoding

    static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = ServerDate.parse(raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(raw)")
            }
            return date
        }
        return decoder
    }

    // MARK: - Error mapping

    private struct ServerErrorBody: Decodable {
        let error: String
    }

    static func serverMessage(from data: Data) -> String? {
        (try? JSONDecoder().decode(ServerErrorBody.self, from: data))?.error
    }

    static func mapStatus(_ status: Int, message: String?) -> APIError {
        switch status {
        case 401: return .unauthorized(message: message)
        case 403: return .forbidden(message: message)
        case 404: return .notFound(message: message)
        default: return .server(status: status, message: message)
        }
    }

    static func mapTransportError(_ error: Error) -> Error {
        if error is CancellationError || error is APIError { return error }
        guard let urlError = error as? URLError else {
            return APIError.transport(code: URLError.unknown.rawValue)
        }
        switch urlError.code {
        case .cancelled:
            return CancellationError()
        case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff:
            return APIError.offline
        case .timedOut:
            return APIError.timeout
        case .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed:
            return APIError.serverUnreachable
        case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
             .serverCertificateNotYetValid, .serverCertificateHasUnknownRoot,
             .clientCertificateRejected, .clientCertificateRequired, .appTransportSecurityRequiresSecureConnection:
            return APIError.secureConnectionFailed
        default:
            return APIError.transport(code: urlError.code.rawValue)
        }
    }
}

/// The server emits `Date.toISOString()` (`2025-01-31T12:34:56.789Z`).
enum ServerDate {
    static func parse(_ raw: String) -> Date? {
        if let date = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(raw) {
            return date
        }
        return try? Date.ISO8601FormatStyle().parse(raw)
    }
}
