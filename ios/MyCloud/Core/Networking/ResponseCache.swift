import Foundation

/// On-disk cache of raw JSON responses for GET endpoints marked cacheable.
///
/// Lets screens show the last known data instantly and keep working offline.
/// Responses are personalised (`likedByMe`), so the cache belongs to one
/// account: `activate(ownerID:)` wipes it when a different user signs in.
actor ResponseCache {
    private let directory: URL
    private let fileManager = FileManager.default
    private var ownerID: String?

    init(directory: URL) {
        self.directory = directory
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        ownerID = try? String(contentsOf: Self.ownerFile(in: directory), encoding: .utf8)
    }

    static func makeDefault() -> ResponseCache {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return ResponseCache(directory: caches.appendingPathComponent("Responses", isDirectory: true))
    }

    // MARK: - Ownership

    /// Call when a user is signed in. Different user → previous data is deleted.
    func activate(ownerID newOwner: String) {
        guard newOwner != ownerID else { return }
        removeAll()
        ownerID = newOwner
        try? newOwner.write(to: Self.ownerFile(in: directory), atomically: true, encoding: .utf8)
    }

    // MARK: - Entries

    func data(for key: String) -> Data? {
        try? Data(contentsOf: fileURL(for: key))
    }

    func store(_ data: Data, for key: String) {
        try? data.write(to: fileURL(for: key), options: .atomic)
    }

    func removeAll() {
        let files = (try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        for file in files where file.lastPathComponent != Self.ownerFileName {
            try? fileManager.removeItem(at: file)
        }
    }

    /// Bytes used on disk.
    func size() -> Int {
        let files = (try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        return files.reduce(0) { total, url in
            total + ((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
    }

    // MARK: - Files

    private static let ownerFileName = ".owner"

    private static func ownerFile(in directory: URL) -> URL {
        directory.appendingPathComponent(ownerFileName)
    }

    private func fileURL(for key: String) -> URL {
        directory.appendingPathComponent(Self.fileName(for: key))
    }

    /// Stable, filesystem-safe name: 64-bit FNV-1a of the key (no CryptoKit
    /// needed; collisions are irrelevant at this scale).
    static func fileName(for key: String) -> String {
        var hash: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in key.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x0000_0100_0000_01B3
        }
        return String(hash, radix: 16) + ".json"
    }
}
