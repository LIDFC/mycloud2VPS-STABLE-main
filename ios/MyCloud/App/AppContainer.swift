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

    init(config: AppConfig = .current, tokenStorage: SecretStorage? = nil) {
        let storage = tokenStorage ?? KeychainSecretStorage(
            keychain: KeychainStore(service: "baby.dirty.mycloud.auth"),
            account: "jwt"
        )
        let tokenStore = TokenStore(storage: storage)

        self.config = config
        self.tokenStore = tokenStore
        self.api = APIClient(
            baseURL: config.apiBaseURL,
            tokenProvider: { await tokenStore.token },
            unauthorizedHandler: { rejected in
                await tokenStore.clear(ifEqualTo: rejected)
            }
        )
    }
}
