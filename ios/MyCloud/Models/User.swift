import Foundation

enum AccountType: String, Codable, Sendable, CaseIterable {
    case listener
    case artist
    case artistPro = "artist_pro"

    var isArtist: Bool { self != .listener }
}

/// The user object embedded in login/register responses.
struct SessionUser: Codable, Hashable, Sendable {
    let id: String
    let username: String
    let role: String
    let accountType: String
}

struct AuthResponse: Decodable, Sendable {
    let token: String
    let user: SessionUser
}

/// `GET /api/auth/me`
struct CurrentUser: Codable, Hashable, Sendable {
    let id: String
    let username: String
    let role: String
    let accountType: String
    let bio: String?
    let avatarUrl: String?
    let backgroundUrl: String?
    let followersCount: Int?
    let followingCount: Int?

    var isAdmin: Bool { role == "admin" }
}

/// `GET /api/users/:username`
struct UserProfile: Decodable, Identifiable, Sendable {
    let id: String
    let username: String
    let accountType: String
    let role: String?
    let bio: String?
    let avatarUrl: String?
    let backgroundUrl: String?
    let followersCount: Int
    let followingCount: Int
    var isFollowedByMe: Bool
    /// Own tracks first, then tracks this user is featured on.
    let tracks: [Track]
    let reposted: [Track]
    /// Only filled in for your own profile.
    let liked: [Track]
    let albums: [Album]
    let totalPlays: Int

    enum CodingKeys: String, CodingKey {
        case id, username, accountType, role, bio, avatarUrl, backgroundUrl
        case followersCount, followingCount, isFollowedByMe, tracks, reposted, liked, albums, totalPlays
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        username = try c.decode(String.self, forKey: .username)
        accountType = try c.decodeIfPresent(String.self, forKey: .accountType) ?? AccountType.listener.rawValue
        role = try c.decodeIfPresent(String.self, forKey: .role)
        bio = try c.decodeIfPresent(String.self, forKey: .bio)
        avatarUrl = try c.decodeIfPresent(String.self, forKey: .avatarUrl)
        backgroundUrl = try c.decodeIfPresent(String.self, forKey: .backgroundUrl)
        followersCount = try c.decodeIfPresent(Int.self, forKey: .followersCount) ?? 0
        followingCount = try c.decodeIfPresent(Int.self, forKey: .followingCount) ?? 0
        isFollowedByMe = try c.decodeIfPresent(Bool.self, forKey: .isFollowedByMe) ?? false
        tracks = try c.decodeIfPresent([Track].self, forKey: .tracks) ?? []
        reposted = try c.decodeIfPresent([Track].self, forKey: .reposted) ?? []
        liked = try c.decodeIfPresent([Track].self, forKey: .liked) ?? []
        albums = try c.decodeIfPresent([Album].self, forKey: .albums) ?? []
        totalPlays = try c.decodeIfPresent(Int.self, forKey: .totalPlays) ?? 0
    }

    var isArtist: Bool { AccountType(rawValue: accountType)?.isArtist ?? false }
}

/// Artist entry in search results.
struct ArtistSummary: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let username: String
    let accountType: String
    let bio: String?
    let avatarUrl: String?
    let followersCount: Int
    var isFollowedByMe: Bool
    let trackCount: Int
}
