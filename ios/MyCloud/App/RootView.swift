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
                SignedInView()
                    .transition(.opacity)
            }
        }
        .animation(.smooth, value: container.session.state)
        .task { await container.session.restore() }
    }
}

/// Phase 2 placeholder for the main tabs (Phase 3): the live-backend
/// check plus account settings.
private struct SignedInView: View {
    @Environment(AppContainer.self) private var container
    @State private var showsSettings = false

    var body: some View {
        NavigationStack {
            ServerStatusView(viewModel: ServerStatusViewModel(api: container.api))
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showsSettings = true
                        } label: {
                            Image(systemName: "person.crop.circle")
                        }
                        .accessibilityLabel("Настройки")
                    }
                }
        }
        .sheet(isPresented: $showsSettings) {
            SettingsView()
        }
    }
}

private struct LaunchView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "waveform")
                .font(.system(size: 40, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 88, height: 88)
                .background(.tint, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            ProgressView()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel("Загрузка")
    }
}
