import Foundation

/// State of anything a screen loads from the network.
enum Loadable<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(APIError)

    var value: Value? {
        if case .loaded(let value) = self { return value }
        return nil
    }

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }
}

extension APIError {
    /// Normalises any thrown error into an `APIError` for display.
    /// Returns `nil` for cancellation, which is never shown to the user.
    init?(_ error: Error) {
        if error is CancellationError { return nil }
        if let apiError = error as? APIError {
            self = apiError
        } else if let urlError = error as? URLError, urlError.code == .cancelled {
            return nil
        } else {
            self = .transport(code: (error as NSError).code)
        }
    }
}
