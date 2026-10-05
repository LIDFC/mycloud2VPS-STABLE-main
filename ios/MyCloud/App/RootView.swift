import SwiftUI

/// Entry point of the UI. Phase 2 switches between Login and the main tabs here.
struct RootView: View {
    @Environment(AppContainer.self) private var container

    var body: some View {
        NavigationStack {
            ServerStatusView(viewModel: ServerStatusViewModel(api: container.api))
        }
    }
}
