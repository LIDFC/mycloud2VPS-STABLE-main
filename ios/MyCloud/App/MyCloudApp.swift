import SwiftUI

@main
struct MyCloudApp: App {
    @State private var container: AppContainer

    init() {
        // Built in init rather than as a property initializer: Swift 6.1 crashes
        // in SILGen on actor-isolated default arguments used from one.
        _container = State(initialValue: Self.makeContainer())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(container)
        }
    }

    private static func makeContainer() -> AppContainer {
        guard ProcessInfo.processInfo.arguments.contains("-ui-testing") else {
            return AppContainer(responseCache: .makeDefault(), downloadsDirectory: DownloadStore.defaultDirectory)
        }
        // UI tests: fresh, isolated state every launch (no Keychain token,
        // no cached user, empty caches) so they never depend on prior runs.
        let sandbox = FileManager.default.temporaryDirectory
            .appendingPathComponent("ui-testing-\(UUID().uuidString)", isDirectory: true)
        let defaultsSuite = "ui-testing-\(UUID().uuidString)"
        return AppContainer(
            tokenStorage: InMemorySecretStorage(),
            userCache: UserCache(defaults: UserDefaults(suiteName: defaultsSuite) ?? .standard),
            responseCache: ResponseCache(directory: sandbox.appendingPathComponent("Responses")),
            downloadsDirectory: sandbox.appendingPathComponent("Downloads")
        )
    }
}
