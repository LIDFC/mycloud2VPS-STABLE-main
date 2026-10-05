import Foundation

struct Album: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let artist: String
    let artistId: String?
    let description: String?
    let genre: String?
    let coverUrl: String?
    let status: String
    var likesCount: Int
    var likedByMe: Bool
    /// Present in `/api/albums`, `/api/albums/:id` and profiles; absent in search results.
    let tracks: [Track]?
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, artist, artistId, description, genre, coverUrl, status
        case likesCount, likedByMe, tracks, createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        artist = try c.decodeIfPresent(String.self, forKey: .artist) ?? ""
        artistId = try c.decodeIfPresent(String.self, forKey: .artistId)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        genre = try c.decodeIfPresent(String.self, forKey: .genre)
        coverUrl = try c.decodeIfPresent(String.self, forKey: .coverUrl)
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "published"
        likesCount = try c.decodeIfPresent(Int.self, forKey: .likesCount) ?? 0
        likedByMe = try c.decodeIfPresent(Bool.self, forKey: .likedByMe) ?? false
        tracks = try c.decodeIfPresent([Track].self, forKey: .tracks)
        createdAt = try? c.decodeIfPresent(Date.self, forKey: .createdAt)
    }

    /// Sum of known track durations, or `nil` if any is still unknown.
    var totalDuration: Double? {
        guard let tracks, !tracks.isEmpty else { return nil }
        let durations = tracks.compactMap(\.duration)
        return durations.count == tracks.count ? durations.reduce(0, +) : nil
    }
}
