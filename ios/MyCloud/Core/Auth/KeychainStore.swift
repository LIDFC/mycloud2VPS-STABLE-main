import Foundation
import Security

/// Minimal generic-password Keychain wrapper for small secrets (the auth token).
///
/// Items use `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`: readable while
/// the phone is locked (background playback needs authenticated requests) and
/// never included in backups or migrated to another device.
struct KeychainStore: Sendable {
    let service: String

    enum KeychainError: Error, Equatable {
        case unexpectedStatus(OSStatus)
        case invalidData
    }

    func string(for account: String) throws -> String? {
        var query = baseQuery(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data, let value = String(data: data, encoding: .utf8) else {
                throw KeychainError.invalidData
            }
            return value
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError.unexpectedStatus(status)
        }
    }

    func set(_ value: String, for account: String) throws {
        let data = Data(value.utf8)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemUpdate(baseQuery(account) as CFDictionary, attributes as CFDictionary)
        switch status {
        case errSecSuccess:
            return
        case errSecItemNotFound:
            var query = baseQuery(account)
            query.merge(attributes) { $1 }
            let addStatus = SecItemAdd(query as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw KeychainError.unexpectedStatus(addStatus) }
        default:
            throw KeychainError.unexpectedStatus(status)
        }
    }

    func remove(_ account: String) throws {
        let status = SecItemDelete(baseQuery(account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    private func baseQuery(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

struct KeychainSecretStorage: SecretStorage {
    let keychain: KeychainStore
    let account: String

    func read() throws -> String? { try keychain.string(for: account) }
    func write(_ value: String) throws { try keychain.set(value, for: account) }
    func delete() throws { try keychain.remove(account) }
}
