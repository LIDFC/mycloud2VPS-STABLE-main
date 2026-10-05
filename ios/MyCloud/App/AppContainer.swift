import Foundation
import Observation

/// Composition root: builds the long-lived services once and hands them to
/// the view hierarchy through the SwiftUI environment.
@MainActor
@Observable
final class AppContainer {
    let config: AppConfig
    let tokenStore: TokenStore
    let api: APIClient
    let session: SessionStore

    init(
        config: AppConfig = .current,
        tokenStorage: SecretStorage? = nil,
        userCache: UserCache = UserCache(),
        urlSession: URLSession = APIClient.makeSession()
    ) {
        let storage = tokenStorage ?? KeychainSecretStorage(
            keychain: KeychainStore(service: "baby.dirty.mycloud.auth"),
            account: "jwt"
        )
        let tokenStore = TokenStore(storage: storage)
        let tokenRejected = TokenRejectedRelay()

        let api = APIClient(
            baseURL: config.apiBaseURL,
            session: urlSession,
            tokenProvider: { await tokenStore.token },
            unauthorizedHandler: { rejected in
                if await tokenStore.clear(ifEqualTo: rejected) {
                    await tokenRejected.fire()
                }
            }
        )
        let session = SessionStore(api: api, tokenStore: tokenStore, userCache: userCache)
        tokenRejected.action = { [weak session] in session?.handleTokenRejected() }

        self.config = config
        self.tokenStore = tokenStore
        self.api = api
        self.session = session
    }
}

/// Bridges the API client's 401 callback (built before the session exists)
/// to the session on the main actor.
@MainActor
private final class TokenRejectedRelay {
    var action: (() -> Void)?
    func fire() { action?() }
}
