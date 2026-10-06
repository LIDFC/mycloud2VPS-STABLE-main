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
    let library: LibraryStore
    let player: PlaybackController
    let nowPlaying: NowPlayingCenter
    let downloads: DownloadStore
    let responseCache: ResponseCache
    let network: NetworkMonitor

    init(
        config: AppConfig = .current,
        tokenStorage: SecretStorage? = nil,
        userCache: UserCache = UserCache(),
        urlSession: URLSession = APIClient.makeSession(),
        responseCache: ResponseCache = .makeDefault(),
        downloadsDirectory: URL = DownloadStore.defaultDirectory,
        listens: ListenRecorder? = nil
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
            responseCache: responseCache,
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
        self.library = LibraryStore(api: api)
        self.responseCache = responseCache
        self.network = NetworkMonitor()
        let downloads = DownloadStore(api: api, directory: downloadsDirectory)
        self.downloads = downloads
        let player = PlaybackController(api: api, listens: listens, localFileURL: { downloads.localURL(for: $0) })
        self.player = player
        self.nowPlaying = NowPlayingCenter(player: player, api: api)
        session.prepareForUser = { [weak self] userID in await self?.activateStorage(for: userID) }
    }

    /// Per-account storage: cached responses and downloads survive re-signing
    /// in as the same user, and are wiped when a different user signs in.
    func activateStorage(for userID: String) async {
        downloads.activate(ownerID: userID)
        await responseCache.activate(ownerID: userID)
    }
}

/// Bridges the API client's 401 callback (built before the session exists)
/// to the session on the main actor.
@MainActor
private final class TokenRejectedRelay {
    var action: (() -> Void)?
    func fire() { action?() }
}
