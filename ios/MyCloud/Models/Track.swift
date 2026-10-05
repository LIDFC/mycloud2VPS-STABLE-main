import Foundation

/// A track as returned by the server's `mapTrack()`.
struct Track: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    /// Free-text artist line chosen by the uploader; not necessarily a username.
    let artist: String
    /// Owner account (the uploader).
    let artistId: String?
    /// Username of the owner account — use this to open the artist page.
    let artistUsername: String?
    let albumId: String?
    let genre: String?
    let description: String?
    let featuring: [FeaturedArtist]
    /// "Artist feat. A, B" — ready for display.
    let artistLine: String
    let status: String
    /// Server-relative: `/api/stream/<id>`.
    let audioUrl: String
    /// Server-relative: `/uploads/covers/<file>`.
    let coverUrl: String?
    let waveformUrl: String?
    var likesCount: Int
    let repostCount: Int
    let playsCount: Int
    var likedByMe: Bool
    let repostedByMe: Bool
    /// Seconds. `nil` until the server has analysed the file.
    let duration: Double?
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, artist, artistId, artistUsername, albumId, genre, description, featuring
        case artistLine, status, audioUrl, coverUrl, waveformUrl, likesCount, repostCount
        case playsCount, likedByMe, repostedByMe, duration, createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        artist = try c.decodeIfPresent(String.self, forKey: .artist) ?? ""
        artistId = try c.decodeIfPresent(String.self, forKey: .artistId)
        artistUsername = try c.decodeIfPresent(String.self, forKey: .artistUsername)
        albumId = try c.decodeIfPresent(String.self, forKey: .albumId)
        genre = try c.decodeIfPresent(String.self, forKey: .genre)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        featuring = (try? c.decodeIfPresent([FeaturedArtist].self, forKey: .featuring)) ?? []
        artistLine = try c.decodeIfPresent(String.self, forKey: .artistLine) ?? artist
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "published"
        audioUrl = try c.decodeIfPresent(String.self, forKey: .audioUrl) ?? "/api/stream/\(id)"
        coverUrl = try c.decodeIfPresent(String.self, forKey: .coverUrl)
        waveformUrl = try c.decodeIfPresent(String.self, forKey: .waveformUrl)
        likesCount = try c.decodeIfPresent(Int.self, forKey: .likesCount) ?? 0
        repostCount = try c.decodeIfPresent(Int.self, forKey: .repostCount) ?? 0
        playsCount = try c.decodeIfPresent(Int.self, forKey: .playsCount) ?? 0
        likedByMe = try c.decodeIfPresent(Bool.self, forKey: .likedByMe) ?? false
        repostedByMe = try c.decodeIfPresent(Bool.self, forKey: .repostedByMe) ?? false
        duration = try c.decodeIfPresent(Double.self, forKey: .duration)
        createdAt = try? c.decodeIfPresent(Date.self, forKey: .createdAt)
    }
}

struct FeaturedArtist: Codable, Hashable, Sendable {
    /// `"user"` (linked account) or `"text"` (plain name).
    let type: String
    let userId: String?
    let username: String?
    let display: String

    enum CodingKeys: String, CodingKey { case type, userId, username, display, value }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = try c.decodeIfPresent(String.self, forKey: .type) ?? "text"
        userId = try c.decodeIfPresent(String.self, forKey: .userId)
        username = try c.decodeIfPresent(String.self, forKey: .username)
        display = try c.decodeIfPresent(String.self, forKey: .display)
            ?? username
            ?? c.decodeIfPresent(String.self, forKey: .value)
            ?? ""
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(type, forKey: .type)
        try c.encodeIfPresent(userId, forKey: .userId)
        try c.encodeIfPresent(username, forKey: .username)
        try c.encode(display, forKey: .display)
    }

    /// Linked to a MyCloud account, so the artist page can be opened.
    var isLinkedUser: Bool { type == "user" && username != nil }
}
