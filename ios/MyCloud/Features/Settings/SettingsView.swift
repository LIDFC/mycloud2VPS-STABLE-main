import SwiftUI

struct SettingsView: View {
    @Environment(AppContainer.self) private var container
    @Environment(\.dismiss) private var dismiss
    @State private var confirmsSignOut = false

    var body: some View {
        NavigationStack {
            List {
                if let user = container.session.currentUser {
                    Section {
                        HStack(spacing: 14) {
                            Image(systemName: "person.crop.circle.fill")
                                .font(.system(size: 44))
                                .foregroundStyle(.tint)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(user.username)
                                    .font(.headline)
                                Text(accountTypeTitle(user))
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section("Сервер") {
                    LabeledContent("Адрес", value: container.config.apiBaseURL.absoluteString)
                }

                Section("О приложении") {
                    LabeledContent("Версия", value: Self.appVersion)
                }

                Section {
                    Button("Выйти из аккаунта", role: .destructive) {
                        confirmsSignOut = true
                    }
                }
            }
            .navigationTitle("Настройки")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Готово") { dismiss() }
                }
            }
            .confirmationDialog("Выйти из аккаунта?", isPresented: $confirmsSignOut, titleVisibility: .visible) {
                Button("Выйти", role: .destructive) {
                    Task {
                        dismiss()
                        await container.session.signOut()
                    }
                }
            }
        }
    }

    private func accountTypeTitle(_ user: CurrentUser) -> LocalizedStringKey {
        if user.isAdmin { return "Администратор" }
        switch AccountType(rawValue: user.accountType) {
        case .artist: return "Исполнитель"
        case .artistPro: return "Исполнитель Pro"
        default: return "Слушатель"
        }
    }

    private static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "—"
        let build = info?["CFBundleVersion"] as? String ?? "—"
        return "\(version) (\(build))"
    }
}
