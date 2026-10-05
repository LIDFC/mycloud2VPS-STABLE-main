import SwiftUI

struct PlaylistDetailView: View {
    let playlistID: String
    @Environment(AppContainer.self) private var container
    @Environment(\.play) private var play

    private var library: LibraryStore { container.library }

    var body: some View {
        Group {
            if let playlist = library.playlist(id: playlistID) {
                content(playlist)
            } else if case .failed(let error) = library.playlists {
                ErrorStateView(error: error) { await library.reloadPlaylists() }
            } else if library.playlists.value != nil {
                EmptyStateView(title: "Плейлист не найден", systemImage: "music.note.list",
                               message: "Возможно, он был удалён")
            } else {
                LoadingStateView()
            }
        }
        .navigationTitle(library.playlist(id: playlistID)?.name ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if library.playlists.value == nil { await library.reloadPlaylists() }
        }
    }

    private func content(_ playlist: Playlist) -> some View {
        List {
            Section {
                VStack(spacing: 14) {
                    PlaylistArtwork(playlist: playlist, size: 220)
                        .shadow(color: .black.opacity(0.18), radius: 18, y: 10)
                    VStack(spacing: 4) {
                        Text(playlist.name)
                            .font(.title2.bold())
                            .multilineTextAlignment(.center)
                        if let description = playlist.description, !description.isEmpty {
                            Text(description)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                        }
                    }
                    PlayShuffleButtons(tracks: playlist.tracks)
                }
                .frame(maxWidth: .infinity)
                .listRowSeparator(.hidden)
            }

            Section {
                if playlist.tracks.isEmpty {
                    Text("В плейлисте пока нет треков")
                        .foregroundStyle(.secondary)
                }
                ForEach(Array(playlist.tracks.enumerated()), id: \.element.id) { index, track in
                    Button {
                        play(playlist.tracks, startAt: index)
                    } label: {
                        TrackRow(track: track)
                    }
                    .buttonStyle(.plain)
                    .contextMenu { TrackContextMenu(track: track) }
                }
            } footer: {
                if !playlist.tracks.isEmpty {
                    Text(Format.trackCount(playlist.tracks.count))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.plain)
        .refreshable { await library.reloadPlaylists() }
    }
}
