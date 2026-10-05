import Foundation

struct Playlist: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let ownerId: String
    let name: String
    let description: String?
    let coverUrl: String?
    let tracks: [Track]
    let createdAt: Date?
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, ownerId, name, description, coverUrl, tracks, createdAt, updatedAt
    }

    init(id: String, ownerId: String, name: String, description: String?, coverUrl: String?,
         tracks: [Track], createdAt: Date?, updatedAt: Date?) {
        self.id = id
        self.ownerId = ownerId
        self.name = name
        self.description = description
        self.coverUrl = coverUrl
        self.tracks = tracks
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        ownerId = try c.decode(String.self, forKey: .ownerId)
        name = try c.decode(String.self, forKey: .name)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        coverUrl = try c.decodeIfPresent(String.self, forKey: .coverUrl)
        tracks = try c.decodeIfPresent([Track].self, forKey: .tracks) ?? []
        createdAt = try? c.decodeIfPresent(Date.self, forKey: .createdAt)
        updatedAt = try? c.decodeIfPresent(Date.self, forKey: .updatedAt)
    }
}

struct PlaylistResponse: Decodable, Sendable {
    let playlist: Playlist
}

/// `GET /api/search?q=`
struct SearchResults: Decodable, Sendable {
    let tracks: [Track]
    let artists: [ArtistSummary]
    let albums: [Album]

    var isEmpty: Bool { tracks.isEmpty && artists.isEmpty && albums.isEmpty }

    static let empty = SearchResults(tracks: [], artists: [], albums: [])

    init(tracks: [Track], artists: [ArtistSummary], albums: [Album]) {
        self.tracks = tracks
        self.artists = artists
        self.albums = albums
    }

    enum CodingKeys: String, CodingKey { case tracks, artists, albums }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tracks = try c.decodeIfPresent([Track].self, forKey: .tracks) ?? []
        artists = try c.decodeIfPresent([ArtistSummary].self, forKey: .artists) ?? []
        albums = try c.decodeIfPresent([Album].self, forKey: .albums) ?? []
    }
}

/// `GET /api/recommendations` — every published track grouped by genre,
/// ordered by the user's listening history.
struct Recommendations: Decodable, Sendable {
    struct GenreGroup: Decodable, Identifiable, Sendable {
        let genre: String
        let tracks: [Track]
        var id: String { genre }
    }

    let groups: [GenreGroup]
    let topGenres: [String]
}

/// `GET /api/daily-playlist` — same 20 tracks for everyone, rotated daily.
struct DailyPlaylist: Decodable, Sendable {
    let tracks: [Track]
    /// `yyyy-MM-dd`, `nil` when the catalogue is empty.
    let date: String?
}

struct LikeResponse: Decodable, Sendable {
    let likesCount: Int
    let likedByMe: Bool
}

struct FollowResponse: Decodable, Sendable {
    let followersCount: Int
    let isFollowedByMe: Bool
}

struct ListenResponse: Decodable, Sendable {
    let playsCount: Int?
}

struct HealthResponse: Decodable, Sendable {
    let ok: Bool
    let uptime: Double?
}
