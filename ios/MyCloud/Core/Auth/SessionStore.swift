import Foundation
import Observation

/// Who is signed in. Drives the root of the UI (Login vs. main tabs).
@MainActor
@Observable
final class SessionStore {
    enum State: Equatable {
        /// Checking the stored token at launch.
        case restoring
        case signedOut
        case signedIn(CurrentUser)
    }

    private(set) var state: State = .restoring

    var currentUser: CurrentUser? {
        if case .signedIn(let user) = state { return user }
        return nil
    }

    /// Runs before the signed-in UI appears (per-account caches/downloads), so
    /// one account's data can never flash up for another.
    @ObservationIgnored var prepareForUser: (@MainActor (_ userID: String) async -> Void)?

    private let api: APIClient
    private let tokenStore: TokenStore
    private let userCache: UserCache

    init(api: APIClient, tokenStore: TokenStore, userCache: UserCache = UserCache()) {
        self.api = api
        self.tokenStore = tokenStore
        self.userCache = userCache
    }

    // MARK: - Launch

    /// Validates the stored token. Offline, the last known user is kept so the
    /// app (and later the offline library) stays usable without a network.
    func restore() async {
        guard await tokenStore.token != nil else {
            userCache.clear()
            state = .signedOut
            return
        }
        do {
            let user = try await api.send(API.Auth.me())
            userCache.save(user)
            await signIn(user)
        } catch let error as APIError {
            switch error {
            case .unauthorized, .notFound:
                await signOut()
            default:
                if let cached = userCache.load() {
                    await signIn(cached)
                } else {
                    // Never had a profile on this device: we can't show anything useful.
                    state = .signedOut
                }
            }
        } catch {
            if let cached = userCache.load() {
                await signIn(cached)
            } else {
                state = .signedOut
            }
        }
    }

    // MARK: - Sign in / up / out

    func login(username: String, password: String) async throws {
        let response = try await api.send(API.Auth.login(username: username, password: password))
        try await completeSignIn(response)
    }

    func register(username: String, password: String) async throws {
        let response = try await api.send(API.Auth.register(username: username, password: password))
        try await completeSignIn(response)
    }

    func signOut() async {
        await tokenStore.clear()
        userCache.clear()
        state = .signedOut
    }

    /// Called when the API rejected the current token (expired after 7 days,
    /// secret rotated, user deleted). The token is already cleared by then.
    func handleTokenRejected() {
        userCache.clear()
        state = .signedOut
    }

    private func completeSignIn(_ response: AuthResponse) async throws {
        do {
            try await tokenStore.save(response.token)
        } catch {
            throw SessionError.keychainUnavailable
        }
        // Login returns a short user; /me adds profile fields. Fall back if it fails.
        let user = (try? await api.send(API.Auth.me())) ?? CurrentUser(response.user)
        userCache.save(user)
        await signIn(user)
    }

    private func signIn(_ user: CurrentUser) async {
        await prepareForUser?(user.id)
        state = .signedIn(user)
    }
}

enum SessionError: LocalizedError, Equatable {
    case keychainUnavailable

    var errorDescription: String? {
        String(localized: "Не удалось сохранить сессию на устройстве. Попробуйте ещё раз")
    }
}

extension CurrentUser {
    init(_ user: SessionUser) {
        self.init(id: user.id, username: user.username, role: user.role, accountType: user.accountType,
                  bio: nil, avatarUrl: nil, backgroundUrl: nil, followersCount: nil, followingCount: nil)
    }
}

/// Last signed-in profile (id, username, avatar path — nothing secret) so the
/// app can start offline. The token itself lives only in the Keychain.
struct UserCache: Sendable {
    private let key = "session.lastUser"
    nonisolated(unsafe) private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> CurrentUser? {
        defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(CurrentUser.self, from: $0) }
    }

    func save(_ user: CurrentUser) {
        if let data = try? JSONEncoder().encode(user) { defaults.set(data, forKey: key) }
    }

    func clear() {
        defaults.removeObject(forKey: key)
    }
}
