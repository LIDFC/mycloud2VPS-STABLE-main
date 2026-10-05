import Foundation

// MARK: - Likes

extension LibraryStore {
    /// Like state as the UI should show it: an optimistic local value if the
    /// user changed it this session, else what the server sent with the track.
    func isLiked(_ track: Track) -> Bool {
        trackLikes[track.id] ?? track.likedByMe
    }

    func isLiked(_ album: Album) -> Bool {
        albumLikes[album.id] ?? album.likedByMe
    }

    func toggleLike(_ track: Track) async {
        await setLiked(!isLiked(track), track: track)
    }

    func toggleLike(_ album: Album) async {
        await setLiked(!isLiked(album), album: album)
    }

    /// The server only offers a *toggle*. To reach a desired state safely:
    /// update the UI immediately, send one request at a time per item, and
    /// toggle again if the server's answer doesn't match the latest wish
    /// (e.g. after a quick double tap).
    func setLiked(_ liked: Bool, track: Track) async {
        let id = track.id
        let confirmed = confirmedTrackLikes[id] ?? track.likedByMe
        trackLikes[id] = liked
        updateLikedTracksList(track, liked: liked)
        guard !likesInFlight.contains(id) else { return }  // the running loop will reconcile

        likesInFlight.insert(id)
        defer { likesInFlight.remove(id) }

        var serverState = confirmed
        do {
            for _ in 0..<3 where serverState != trackLikes[id] {
                let response = try await api.send(API.Library.toggleTrackLike(id: id))
                serverState = response.likedByMe
                confirmedTrackLikes[id] = serverState
            }
        } catch {
            // Roll back to the last state the server confirmed.
            trackLikes[id] = serverState
            updateLikedTracksList(track, liked: serverState)
            report(error, fallback: String(localized: "Не удалось изменить «Нравится»"))
            return
        }
        trackLikes[id] = serverState
        updateLikedTracksList(track, liked: serverState)
    }

    func setLiked(_ liked: Bool, album: Album) async {
        let id = album.id
        let confirmed = confirmedAlbumLikes[id] ?? album.likedByMe
        albumLikes[id] = liked
        updateLikedAlbumsList(album, liked: liked)
        guard !likesInFlight.contains("album:" + id) else { return }

        likesInFlight.insert("album:" + id)
        defer { likesInFlight.remove("album:" + id) }

        var serverState = confirmed
        do {
            for _ in 0..<3 where serverState != albumLikes[id] {
                let response = try await api.send(API.Library.toggleAlbumLike(id: id))
                serverState = response.likedByMe
                confirmedAlbumLikes[id] = serverState
            }
        } catch {
            albumLikes[id] = serverState
            updateLikedAlbumsList(album, liked: serverState)
            report(error, fallback: String(localized: "Не удалось изменить «Нравится»"))
            return
        }
        albumLikes[id] = serverState
        updateLikedAlbumsList(album, liked: serverState)
    }

    private func updateLikedTracksList(_ track: Track, liked: Bool) {
        guard var list = likedTracks.value else { return }
        list.removeAll { $0.id == track.id }
        if liked {
            var copy = track
            copy.likedByMe = true
            list.insert(copy, at: 0)
        }
        likedTracks = .loaded(list)
    }

    private func updateLikedAlbumsList(_ album: Album, liked: Bool) {
        guard var list = likedAlbums.value else { return }
        list.removeAll { $0.id == album.id }
        if liked {
            var copy = album
            copy.likedByMe = true
            list.insert(copy, at: 0)
        }
        likedAlbums = .loaded(list)
    }
}

// MARK: - Playlists

extension LibraryStore {
    @discardableResult
    func createPlaylist(name: String, description: String?) async -> Playlist? {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return nil }
        do {
            let response = try await api.send(API.Playlists.create(name: name, description: description?.nilIfBlank))
            upsert(response.playlist, atTop: true)
            return response.playlist
        } catch {
            report(error, fallback: String(localized: "Не удалось создать плейлист"))
            return nil
        }
    }

    @discardableResult
    func updatePlaylist(_ playlist: Playlist, name: String, description: String?) async -> Bool {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return false }
        do {
            let response = try await api.send(API.Playlists.update(id: playlist.id, name: name, description: description?.nilIfBlank))
            upsert(response.playlist, atTop: false)
            return true
        } catch {
            report(error, fallback: String(localized: "Не удалось сохранить плейлист"))
            return false
        }
    }

    @discardableResult
    func deletePlaylist(_ playlist: Playlist) async -> Bool {
        do {
            _ = try await api.send(API.Playlists.delete(id: playlist.id))
            if var list = playlists.value {
                list.removeAll { $0.id == playlist.id }
                playlists = .loaded(list)
            }
            return true
        } catch {
            report(error, fallback: String(localized: "Не удалось удалить плейлист"))
            return false
        }
    }

    @discardableResult
    func add(_ track: Track, to playlist: Playlist) async -> Bool {
        if playlist.tracks.contains(where: { $0.id == track.id }) {
            message = String(localized: "Трек уже есть в «\(playlist.name)»")
            return true
        }
        do {
            let response = try await api.send(API.Playlists.addTrack(playlistId: playlist.id, trackId: track.id))
            upsert(response.playlist, atTop: true)
            message = String(localized: "Добавлено в «\(playlist.name)»")
            return true
        } catch {
            report(error, fallback: String(localized: "Не удалось добавить трек в плейлист"))
            return false
        }
    }

    func remove(_ track: Track, from playlist: Playlist) async {
        // Optimistic: the row disappears immediately, restored on failure.
        let original = playlist
        if var list = playlists.value, let index = list.firstIndex(where: { $0.id == playlist.id }) {
            list[index] = playlist.removing(trackID: track.id)
            playlists = .loaded(list)
        }
        do {
            _ = try await api.send(API.Playlists.removeTrack(playlistId: playlist.id, trackId: track.id))
        } catch {
            upsert(original, atTop: false)
            report(error, fallback: String(localized: "Не удалось убрать трек из плейлиста"))
        }
    }

    /// Replaces (or inserts) a playlist with the server's copy.
    private func upsert(_ playlist: Playlist, atTop: Bool) {
        var list = playlists.value ?? []
        if let index = list.firstIndex(where: { $0.id == playlist.id }) {
            list.remove(at: index)
            list.insert(playlist, at: atTop ? 0 : index)
        } else {
            list.insert(playlist, at: 0)
        }
        playlists = .loaded(list)
    }

    private func report(_ error: Error, fallback: String) {
        guard let apiError = APIError(error) else { return }
        switch apiError {
        case .offline, .timeout, .serverUnreachable:
            message = apiError.localizedDescription
        default:
            message = fallback
        }
    }
}

extension Playlist {
    func removing(trackID: String) -> Playlist {
        Playlist(id: id, ownerId: ownerId, name: name, description: description, coverUrl: coverUrl,
                 tracks: tracks.filter { $0.id != trackID }, createdAt: createdAt, updatedAt: updatedAt)
    }
}

extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
