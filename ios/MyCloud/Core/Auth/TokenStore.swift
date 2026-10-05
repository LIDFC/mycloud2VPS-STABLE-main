import Foundation

/// Where the auth token lives. The live implementation is the Keychain;
/// tests use `InMemorySecretStorage`.
protocol SecretStorage: Sendable {
    func read() throws -> String?
    func write(_ value: String) throws
    func delete() throws
}

/// Serialises access to the JWT and caches it in memory so every request
/// doesn't hit the Keychain.
actor TokenStore {
    private let storage: SecretStorage
    private var cached: String?
    private var didLoad = false

    init(storage: SecretStorage) {
        self.storage = storage
    }

    var token: String? {
        if !didLoad {
            cached = try? storage.read()
            didLoad = true
        }
        return cached
    }

    func save(_ token: String) throws {
        try storage.write(token)
        cached = token
        didLoad = true
    }

    func clear() {
        try? storage.delete()
        cached = nil
        didLoad = true
    }

    /// Clears the token only if it's still the one the server rejected, so a
    /// late 401 from an old request can't sign out a freshly logged-in user.
    /// - Returns: `true` if the token was cleared.
    @discardableResult
    func clear(ifEqualTo rejected: String) -> Bool {
        guard token == rejected else { return false }
        clear()
        return true
    }
}

final class InMemorySecretStorage: SecretStorage, @unchecked Sendable {
    private let lock = NSLock()
    private var value: String?

    init(_ value: String? = nil) { self.value = value }

    func read() throws -> String? { lock.withLock { value } }
    func write(_ value: String) throws { lock.withLock { self.value = value } }
    func delete() throws { lock.withLock { value = nil } }
}
