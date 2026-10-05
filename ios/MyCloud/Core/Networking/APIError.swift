import Foundation

/// Every failure the API layer can surface to the UI.
enum APIError: Error, Equatable, Sendable {
    /// No connection, connection lost, airplane mode, etc.
    case offline
    case timeout
    /// DNS failure or connection refused: the server itself is down or unreachable.
    case serverUnreachable
    /// TLS handshake or certificate problem.
    case secureConnectionFailed
    /// 401 — missing, expired or invalid token.
    case unauthorized(message: String?)
    /// 403
    case forbidden(message: String?)
    /// 404
    case notFound(message: String?)
    /// Any other non-2xx response; `message` is the server's `{ "error": "..." }`.
    case server(status: Int, message: String?)
    /// 2xx response whose body didn't match the expected model.
    case decoding(details: String)
    /// Unexpected transport-level failure.
    case transport(code: Int)
    case invalidRequest(details: String)

    /// Worth offering a "Retry" button.
    var isRetryable: Bool {
        switch self {
        case .offline, .timeout, .serverUnreachable, .transport: return true
        case .server(let status, _): return status >= 500
        default: return false
        }
    }
}

extension APIError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .offline:
            return String(localized: "Нет подключения к интернету")
        case .timeout:
            return String(localized: "Сервер не отвечает. Попробуйте ещё раз")
        case .serverUnreachable:
            return String(localized: "Сервер MyCloud недоступен. Попробуйте позже")
        case .secureConnectionFailed:
            return String(localized: "Не удалось установить защищённое соединение с сервером")
        case .unauthorized(let message):
            return message.map(Self.localizedServerMessage) ?? String(localized: "Требуется вход в аккаунт")
        case .forbidden(let message):
            return message.map(Self.localizedServerMessage) ?? String(localized: "Нет доступа")
        case .notFound(let message):
            return message.map(Self.localizedServerMessage) ?? String(localized: "Не найдено")
        case .server(let status, let message):
            if let message, status < 500 { return Self.localizedServerMessage(message) }
            return String(localized: "Ошибка сервера (\(status)). Попробуйте позже")
        case .decoding:
            return String(localized: "Сервер вернул неожиданный ответ")
        case .transport:
            return String(localized: "Ошибка сети. Попробуйте ещё раз")
        case .invalidRequest:
            return String(localized: "Некорректный запрос")
        }
    }

    /// The backend replies in English; translate the messages users can actually hit.
    static func localizedServerMessage(_ message: String) -> String {
        switch message {
        case "Invalid credentials": return String(localized: "Неверное имя пользователя или пароль")
        case "Username already taken": return String(localized: "Это имя пользователя уже занято")
        case "Username too short (min 3)": return String(localized: "Имя пользователя должно быть не короче 3 символов")
        case "Password too short (min 4)": return String(localized: "Пароль должен быть не короче 4 символов")
        case "Username and password required": return String(localized: "Введите имя пользователя и пароль")
        case "Invalid token", "No token": return String(localized: "Сессия истекла. Войдите снова")
        case "Track not found": return String(localized: "Трек не найден")
        case "Album not found": return String(localized: "Альбом не найден")
        case "User not found": return String(localized: "Пользователь не найден")
        case "Playlist not found": return String(localized: "Плейлист не найден")
        case "Playlist name required": return String(localized: "Введите название плейлиста")
        default: return message
        }
    }
}
