import SwiftUI

struct LoadingStateView: View {
    var title: LocalizedStringKey = "Загрузка…"

    var body: some View {
        ProgressView(title)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct ErrorStateView: View {
    let error: APIError
    var retry: (() async -> Void)?

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text(error.localizedDescription)
        } actions: {
            if let retry {
                Button("Повторить") {
                    Task { await retry() }
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private var title: LocalizedStringKey {
        switch error {
        case .offline: "Нет сети"
        case .serverUnreachable, .timeout: "Сервер недоступен"
        default: "Не удалось загрузить"
        }
    }

    private var systemImage: String {
        switch error {
        case .offline: "wifi.slash"
        case .serverUnreachable, .timeout: "icloud.slash"
        case .unauthorized: "person.crop.circle.badge.exclamationmark"
        default: "exclamationmark.triangle"
        }
    }
}

struct EmptyStateView: View {
    let title: LocalizedStringKey
    let systemImage: String
    var message: LocalizedStringKey?

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            if let message { Text(message) }
        }
    }
}

/// Renders loading / error / content for a `Loadable`, with an optional
/// emptiness check so every screen gets all four states for free.
struct LoadableView<Value, Content: View>: View {
    let state: Loadable<Value>
    var isEmpty: (Value) -> Bool = { _ in false }
    var empty: EmptyStateView = EmptyStateView(title: "Пусто", systemImage: "tray")
    let retry: () async -> Void
    @ViewBuilder let content: (Value) -> Content

    var body: some View {
        switch state {
        case .idle, .loading:
            LoadingStateView()
        case .failed(let error):
            ErrorStateView(error: error, retry: retry)
        case .loaded(let value):
            if isEmpty(value) {
                empty
            } else {
                content(value)
            }
        }
    }
}
