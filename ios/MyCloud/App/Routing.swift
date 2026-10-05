import SwiftUI

/// Every pushable screen. Each tab owns a `NavigationStack` with these destinations.
enum Route: Hashable {
    case album(id: String)
    case artist(username: String)
    case tracks(TrackListRoute)
    case playlist(id: String)
}

/// A ready-made list of tracks (daily mix, a genre, liked tracks).
struct TrackListRoute: Hashable {
    let title: String
    var subtitle: String?
    let tracks: [Track]
}

extension View {
    func appDestinations() -> some View {
        navigationDestination(for: Route.self) { route in
            RouteView(route: route)
        }
    }
}

private struct RouteView: View {
    let route: Route
    @Environment(AppContainer.self) private var container

    var body: some View {
        switch route {
        case .album(let id):
            AlbumView(viewModel: AlbumViewModel(albumID: id, api: container.api))
        case .artist(let username):
            ArtistView(viewModel: ArtistViewModel(username: username, api: container.api))
        case .tracks(let list):
            TrackListView(title: list.title, subtitle: list.subtitle, tracks: list.tracks)
        case .playlist(let id):
            PlaylistDetailView(playlistID: id)
        }
    }
}

// MARK: - Playback hook

/// How screens start playback. The player (Phase 4) installs the real action;
/// screens only describe *what* to play.
struct PlayAction {
    let perform: @MainActor (_ tracks: [Track], _ startIndex: Int, _ shuffled: Bool) -> Void

    @MainActor
    func callAsFunction(_ tracks: [Track], startAt index: Int = 0, shuffled: Bool = false) {
        guard !tracks.isEmpty else { return }
        perform(tracks, min(max(index, 0), tracks.count - 1), shuffled)
    }
}

private struct PlayActionKey: EnvironmentKey {
    static var defaultValue: PlayAction { PlayAction { _, _, _ in } }
}

extension EnvironmentValues {
    var play: PlayAction {
        get { self[PlayActionKey.self] }
        set { self[PlayActionKey.self] = newValue }
    }
}
