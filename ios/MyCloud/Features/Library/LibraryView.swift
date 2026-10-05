import SwiftUI

struct LibraryView: View {
    @Environment(AppContainer.self) private var container
    @State private var showsSettings = false

    private var library: LibraryStore { container.library }

    var body: some View {
        content
            .navigationTitle("Медиатека")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showsSettings = true
                    } label: {
                        AccountButtonLabel(user: container.session.currentUser)
                    }
                    .accessibilityLabel("Настройки")
                }
            }
            .sheet(isPresented: $showsSettings) { SettingsView() }
            .task {
                if !library.hasLoaded { await library.load() }
            }
    }

    @ViewBuilder
    private var content: some View {
        if case .failed(let error) = library.likedTracks, case .failed = library.playlists {
            ErrorStateView(error: error) { await library.load() }
        } else if !library.hasLoaded {
            LoadingStateView()
        } else {
            List {
                Section {
                    NavigationLink(value: Route.tracks(TrackListRoute(
                        title: String(localized: "Любимые треки"),
                        subtitle: library.likedTracks.value.map { Format.trackCount($0.count) },
                        tracks: library.likedTracks.value ?? []
                    ))) {
                        LibraryRow(title: "Любимые треки", systemImage: "heart.fill",
                                   detail: library.likedTracks.value.map { "\($0.count)" })
                    }
                    NavigationLink {
                        LikedAlbumsView()
                    } label: {
                        LibraryRow(title: "Альбомы", systemImage: "square.stack.fill",
                                   detail: library.likedAlbums.value.map { "\($0.count)" })
                    }
                }

                Section("Плейлисты") {
                    switch library.playlists {
                    case .loaded(let playlists) where playlists.isEmpty:
                        Text("У вас пока нет плейлистов")
                            .foregroundStyle(.secondary)
                    case .loaded(let playlists):
                        ForEach(playlists) { playlist in
                            NavigationLink(value: Route.playlist(id: playlist.id)) {
                                PlaylistRow(playlist: playlist)
                            }
                        }
                    case .failed(let error):
                        Label(error.localizedDescription, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.secondary)
                    case .idle, .loading:
                        ProgressView()
                    }
                }
            }
            .refreshable { await library.load() }
        }
    }
}

private struct LibraryRow: View {
    let title: LocalizedStringKey
    let systemImage: String
    var detail: String?

    var body: some View {
        HStack {
            Label {
                Text(title)
            } icon: {
                Image(systemName: systemImage)
                    .foregroundStyle(.tint)
            }
            Spacer()
            if let detail {
                Text(detail)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct PlaylistRow: View {
    let playlist: Playlist

    var body: some View {
        HStack(spacing: 12) {
            PlaylistArtwork(playlist: playlist, size: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text(playlist.name)
                    .lineLimit(1)
                Text(Format.trackCount(playlist.tracks.count))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// The playlist's own cover, else the first track's, else a placeholder.
struct PlaylistArtwork: View {
    let playlist: Playlist
    let size: CGFloat

    var body: some View {
        ArtworkView(path: playlist.coverUrl ?? playlist.tracks.first?.coverUrl,
                    targetSize: size, cornerRadius: size > 100 ? 14 : 6,
                    placeholderSeed: playlist.id, placeholderSymbol: "music.note.list")
            .frame(width: size, height: size)
    }
}

private struct AccountButtonLabel: View {
    let user: CurrentUser?

    var body: some View {
        if let user {
            AvatarView(path: user.avatarUrl, name: user.username, size: 30)
        } else {
            Image(systemName: "person.crop.circle")
        }
    }
}

struct LikedAlbumsView: View {
    @Environment(AppContainer.self) private var container

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 16)]

    var body: some View {
        let albums = container.library.likedAlbums.value ?? []
        Group {
            if albums.isEmpty {
                EmptyStateView(title: "Нет сохранённых альбомов", systemImage: "square.stack",
                               message: "Альбомы, которые вам понравились, появятся здесь")
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 20) {
                        ForEach(albums) { album in
                            NavigationLink(value: Route.album(id: album.id)) {
                                AlbumTile(album: album, width: 160)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding()
                }
            }
        }
        .navigationTitle("Альбомы")
    }
}
