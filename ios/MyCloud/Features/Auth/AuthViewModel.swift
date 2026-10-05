import Foundation
import Observation

@MainActor
@Observable
final class AuthViewModel {
    enum Mode: Equatable {
        case login
        case register
    }

    var mode: Mode = .login {
        didSet { if oldValue != mode { errorMessage = nil } }
    }
    var username = ""
    var password = ""
    var passwordConfirmation = ""

    private(set) var isSubmitting = false
    var errorMessage: String?

    private let session: SessionStore

    init(session: SessionStore) {
        self.session = session
    }

    var trimmedUsername: String {
        username.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// First rule the form currently breaks, shown under the fields.
    /// Mirrors the server: username ≥ 3, password ≥ 4.
    var validationMessage: String? {
        Self.validate(mode: mode, username: trimmedUsername, password: password, confirmation: passwordConfirmation)
    }

    var canSubmit: Bool {
        !isSubmitting && !trimmedUsername.isEmpty && !password.isEmpty && validationMessage == nil
    }

    func submit() async {
        guard canSubmit else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            switch mode {
            case .login:
                try await session.login(username: trimmedUsername, password: password)
            case .register:
                try await session.register(username: trimmedUsername, password: password)
            }
        } catch {
            if let apiError = APIError(error) {
                errorMessage = apiError.localizedDescription
            } else if let sessionError = error as? SessionError {
                errorMessage = sessionError.localizedDescription
            }
        }
    }

    nonisolated static func validate(mode: Mode, username: String, password: String, confirmation: String) -> String? {
        // Empty fields just keep the button disabled; no nagging before typing.
        guard !username.isEmpty, !password.isEmpty else { return nil }

        if username.count < 3 {
            return String(localized: "Имя пользователя должно быть не короче 3 символов")
        }
        guard mode == .register else { return nil }

        if username.count > 32 {
            return String(localized: "Имя пользователя должно быть не длиннее 32 символов")
        }
        // Same rule the server applies when a username is changed in the profile.
        if username.range(of: "^[A-Za-z0-9_.-]+$", options: .regularExpression) == nil {
            return String(localized: "Имя: только латинские буквы, цифры и символы _ . -")
        }
        if password.count < 4 {
            return String(localized: "Пароль должен быть не короче 4 символов")
        }
        if !confirmation.isEmpty, confirmation != password {
            return String(localized: "Пароли не совпадают")
        }
        if confirmation.isEmpty {
            return String(localized: "Повторите пароль")
        }
        return nil
    }
}
