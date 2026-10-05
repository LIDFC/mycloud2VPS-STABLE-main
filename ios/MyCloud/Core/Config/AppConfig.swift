import Foundation

/// Build-time configuration. Values come from `Config/*.xcconfig` via Info.plist.
struct AppConfig: Sendable {
    let apiBaseURL: URL

    static let infoPlistKey = "MCAPIBaseURL"

    static let current: AppConfig = {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: infoPlistKey) as? String,
              let config = AppConfig(rawBaseURL: raw)
        else {
            fatalError("\(infoPlistKey) is missing or invalid in Info.plist — set API_BASE_URL in ios/Config/*.xcconfig")
        }
        return config
    }()

    init(apiBaseURL: URL) {
        self.apiBaseURL = apiBaseURL
    }

    /// Accepts `https://host[:port][/path]`; plain http only for local development builds.
    init?(rawBaseURL raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = url.host, !host.isEmpty
        else { return nil }
        self.apiBaseURL = url
    }
}
