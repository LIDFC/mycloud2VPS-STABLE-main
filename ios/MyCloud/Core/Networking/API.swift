import Foundation

/// Every backend endpoint the app uses. Paths and payloads mirror server/server.js.
enum API {
    static func health() -> Endpoint<HealthResponse> {
        Endpoint(.get, ["api", "health"], auth: .none)
    }

    // MARK: - Auth

    enum Auth {
        private struct Credentials: Encodable {
            let username: String
            let password: String
            let accountType: String?
        }

        static func login(username: String, password: String) -> Endpoint<AuthResponse> {
            Endpoint(.post, ["api", "auth", "login"],
                     body: Endpoint<AuthResponse>.jsonBody(Credentials(username: username, password: password, accountType: nil)),
                     auth: .none)
        }

        static func register(username: String, password: String, accountType: AccountType = .listener) -> Endpoint<AuthResponse> {
            Endpoint(.post, ["api", "auth", "register"],
                     body: Endpoint<AuthResponse>.jsonBody(Credentials(username: username, password: password, accountType: accountType.rawValue)),
                     auth: .none)
        }

        static func me() -> Endpoint<CurrentUser> {
            Endpoint(.get, ["api", "auth", "me"], auth: .required)
        }
    }

    // MARK: - Catalogue

    enum Catalog {
        /// All published tracks (no pagination on the server).
        static func tracks() -> Endpoint<[Track]> {
            Endpoint(.get, ["api", "tracks"], auth: .optional).cacheable()
        }

        static func albums() -> Endpoint<[Album]> {
            Endpoint(.get, ["api", "albums"], auth: .optional).cacheable()
        }

        static func album(id: String) -> Endpoint<Album> {
            Endpoint(.get, ["api", "albums", id], auth: .optional).cacheable()
        }

        static func recommendations() -> Endpoint<Recommendations> {
            Endpoint(.get, ["api", "recommendations"], auth: .optional).cacheable()
        }

        static func dailyPlaylist() -> Endpoint<DailyPlaylist> {
            Endpoint(.get, ["api", "daily-playlist"], auth: .optional).cacheable()
        }

        static func search(_ query: String) -> Endpoint<SearchResults> {
            Endpoint(.get, ["api", "search"], query: [URLQueryItem(name: "q", value: query)], auth: .optional)
        }

        /// Artist / user page.
        static func profile(username: String) -> Endpoint<UserProfile> {
            Endpoint(.get, ["api", "users", username], auth: .optional).cacheable()
        }
    }

    // MARK: - Library actions

    enum Library {
        /// Toggles the like; the response is the new state.
        static func toggleTrackLike(id: String) -> Endpoint<LikeResponse> {
            Endpoint(.post, ["api", "tracks", id, "like"], auth: .required)
        }

        /// Toggles the like; the response is the new state.
        static func toggleAlbumLike(id: String) -> Endpoint<LikeResponse> {
            Endpoint(.post, ["api", "albums", id, "like"], auth: .required)
        }

        /// Toggles following; the response is the new state.
        static func toggleFollow(username: String) -> Endpoint<FollowResponse> {
            Endpoint(.post, ["api", "users", username, "follow"], auth: .required)
        }

        /// Counts a play and feeds the genre-based recommendations.
        static func recordListen(trackId: String) -> Endpoint<ListenResponse> {
            Endpoint(.post, ["api", "tracks", "listen"],
                     body: Endpoint<ListenResponse>.jsonBody(["trackId": trackId]),
                     auth: .required)
        }
    }

    // MARK: - Playlists

    enum Playlists {
        private struct Fields: Encodable {
            let name: String
            let description: String?
        }

        static func list() -> Endpoint<[Playlist]> {
            Endpoint(.get, ["api", "playlists"], auth: .required).cacheable()
        }

        static func create(name: String, description: String?) -> Endpoint<PlaylistResponse> {
            Endpoint(.post, ["api", "playlists"],
                     body: Endpoint<PlaylistResponse>.jsonBody(Fields(name: name, description: description)),
                     auth: .required)
        }

        static func update(id: String, name: String, description: String?) -> Endpoint<PlaylistResponse> {
            Endpoint(.put, ["api", "playlists", id],
                     body: Endpoint<PlaylistResponse>.jsonBody(Fields(name: name, description: description ?? "")),
                     auth: .required)
        }

        static func delete(id: String) -> Endpoint<EmptyResponse> {
            Endpoint(.delete, ["api", "playlists", id], auth: .required)
        }

        static func addTrack(playlistId: String, trackId: String) -> Endpoint<PlaylistResponse> {
            Endpoint(.post, ["api", "playlists", playlistId, "tracks"],
                     body: Endpoint<PlaylistResponse>.jsonBody(["trackId": trackId]),
                     auth: .required)
        }

        static func removeTrack(playlistId: String, trackId: String) -> Endpoint<EmptyResponse> {
            Endpoint(.delete, ["api", "playlists", playlistId, "tracks", trackId], auth: .required)
        }
    }
}
