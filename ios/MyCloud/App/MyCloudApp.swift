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
                .preferredColorScheme(Self.forcedColorScheme)
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
            downloadsDirectory: sandbox.appendingPathComponent("Downloads"),
            // Automated runs against the real server must not inflate play counts.
            listens: .disabled
        )
    }

    /// `-ui-appearance dark|light` (UI tests / screenshots only).
    private static var forcedColorScheme: ColorScheme? {
        let arguments = ProcessInfo.processInfo.arguments
        guard arguments.contains("-ui-testing"),
              let index = arguments.firstIndex(of: "-ui-appearance"), index + 1 < arguments.count
        else { return nil }
        switch arguments[index + 1] {
        case "dark": return .dark
        case "light": return .light
        default: return nil
        }
    }
}
