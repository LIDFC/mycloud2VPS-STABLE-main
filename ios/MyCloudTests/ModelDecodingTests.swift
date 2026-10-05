import XCTest
@testable import MyCloud

/// Decodes real (trimmed) backend responses — guards against API drift.
final class ModelDecodingTests: XCTestCase {
    func testTracks() throws {
        let tracks = try Fixture.decode([Track].self, from: "tracks")
        XCTAssertFalse(tracks.isEmpty)

        let first = try XCTUnwrap(tracks.first)
        XCTAssertEqual(first.title, "Мама я люблю")
        XCTAssertEqual(first.artist, "Anacondaz")
        XCTAssertEqual(first.artistUsername, "Iwouldtipfate")
        XCTAssertEqual(first.audioUrl, "/api/stream/\(first.id)")
        XCTAssertEqual(try XCTUnwrap(first.duration), 225.1, accuracy: 0.01)
        XCTAssertNotNil(first.createdAt)

        let featured = try XCTUnwrap(tracks.first { !$0.featuring.isEmpty })
        XCTAssertTrue(featured.artistLine.contains("feat."))
        XCTAssertFalse(featured.featuring[0].display.isEmpty)
    }

    func testTrackToleratesMissingOptionalFields() throws {
        let json = Data.json(#"{"id":"t1","title":"Old track","artist":"Someone","createdAt":"not a date"}"#)
        let track = try APIClient.makeDecoder().decode(Track.self, from: json)
        XCTAssertEqual(track.artistLine, "Someone")
        XCTAssertEqual(track.audioUrl, "/api/stream/t1")
        XCTAssertEqual(track.featuring, [])
        XCTAssertEqual(track.likesCount, 0)
        XCTAssertNil(track.duration)
        XCTAssertNil(track.createdAt)
    }

    func testFeaturedArtistLegacyValueKey() throws {
        let json = Data.json(#"{"type":"text","value":"Legacy Name"}"#)
        let artist = try JSONDecoder().decode(FeaturedArtist.self, from: json)
        XCTAssertEqual(artist.display, "Legacy Name")
        XCTAssertFalse(artist.isLinkedUser)
    }

    func testAlbumAndAlbums() throws {
        let album = try Fixture.decode(Album.self, from: "album")
        XCTAssertFalse(album.title.isEmpty)
        XCTAssertFalse(try XCTUnwrap(album.tracks).isEmpty)

        let albums = try Fixture.decode([Album].self, from: "albums")
        XCTAssertEqual(albums.count, 2)
    }

    func testSearchAlbumsHaveNoTracks() throws {
        let results = try Fixture.decode(SearchResults.self, from: "search")
        XCTAssertFalse(results.isEmpty)
        XCTAssertFalse(results.artists.isEmpty)
        XCTAssertTrue(results.albums.allSatisfy { $0.tracks == nil })
    }

    func testProfile() throws {
        let profile = try Fixture.decode(UserProfile.self, from: "profile")
        XCTAssertEqual(profile.username, "Heroinwater")
        XCTAssertTrue(profile.isArtist)
        XCTAssertFalse(profile.tracks.isEmpty)
        XCTAssertFalse(profile.albums.isEmpty)
    }

    func testRecommendationsAndDaily() throws {
        let recommendations = try Fixture.decode(Recommendations.self, from: "recommendations")
        XCTAssertFalse(recommendations.groups.isEmpty)
        XCTAssertFalse(recommendations.groups[0].tracks.isEmpty)

        let daily = try Fixture.decode(DailyPlaylist.self, from: "daily_playlist")
        XCTAssertFalse(daily.tracks.isEmpty)
        XCTAssertNotNil(daily.date)
    }

    func testAuth() throws {
        let auth = try Fixture.decode(AuthResponse.self, from: "register")
        XCTAssertEqual(auth.token, "test-token")
        XCTAssertEqual(auth.user.username, "fixture_user")

        let me = try Fixture.decode(CurrentUser.self, from: "me")
        XCTAssertEqual(me.username, "fixture_user")
        XCTAssertFalse(me.isAdmin)
    }

    func testPlaylists() throws {
        let created = try Fixture.decode(PlaylistResponse.self, from: "playlist_add")
        XCTAssertEqual(created.playlist.name, "Fixture")
        XCTAssertEqual(created.playlist.tracks.count, 1)

        let list = try Fixture.decode([Playlist].self, from: "playlists")
        XCTAssertEqual(list.first?.tracks.count, 1)
    }

    func testSmallResponses() throws {
        let like = try Fixture.decode(LikeResponse.self, from: "like")
        XCTAssertTrue(like.likedByMe)
        XCTAssertEqual(like.likesCount, 1)

        XCTAssertNotNil(try Fixture.decode(ListenResponse.self, from: "listen").playsCount)
        XCTAssertTrue(try Fixture.decode(HealthResponse.self, from: "health").ok)
    }

    func testServerDate() {
        XCTAssertNotNil(ServerDate.parse("2026-10-05T22:16:23.010Z"))
        XCTAssertNotNil(ServerDate.parse("2026-10-05T22:16:23Z"))
        XCTAssertNil(ServerDate.parse("05.10.2026"))
    }
}
