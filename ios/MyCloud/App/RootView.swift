import SwiftUI

/// Switches between launch, sign-in and the signed-in app.
struct RootView: View {
    @Environment(AppContainer.self) private var container

    var body: some View {
        Group {
            switch container.session.state {
            case .restoring:
                LaunchView()
            case .signedOut:
                AuthView(viewModel: AuthViewModel(session: container.session))
                    .transition(.opacity)
            case .signedIn:
                MainTabView()
                    .transition(.opacity)
            }
        }
        .animation(.smooth, value: container.session.state)
        .task { await container.session.restore() }
        .onChange(of: container.session.currentUser?.id) {
            // Never show one account's library or queue to another.
            container.library.reset()
            container.player.stop()
        }
    }
}

private struct LaunchView: View {
    var body: some View {
        VStack(spacing: 20) {
            AppMark()
            ProgressView()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel("Загрузка")
    }
}
