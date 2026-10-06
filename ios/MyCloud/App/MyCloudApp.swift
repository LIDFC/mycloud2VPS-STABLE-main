import SwiftUI

@main
struct MyCloudApp: App {
    @State private var container: AppContainer

    init() {
        // Built in init rather than as a property initializer: Swift 6.1 crashes
        // in SILGen on actor-isolated default arguments used from one.
        _container = State(initialValue: AppContainer(
            responseCache: .makeDefault(),
            downloadsDirectory: DownloadStore.defaultDirectory
        ))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(container)
        }
    }
}
