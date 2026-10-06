import SwiftUI

struct PlaylistDetailView: View {
    let playlistID: String
    @Environment(AppContainer.self) private var container
    @Environment(\.play) private var play
    @Environment(\.dismiss) private var dismiss
    @State private var editing: Playlist?
    @State private var confirmsDelete = false

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
        .toolbar {
            if let playlist = library.playlist(id: playlistID) {
                ToolbarItem(placement: .topBarTrailing) {
                    DownloadAllButton(tracks: playlist.tracks)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            editing = playlist
                        } label: {
                            Label("Изменить", systemImage: "pencil")
                        }
                        Button(role: .destructive) {
                            confirmsDelete = true
                        } label: {
                            Label("Удалить плейлист", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("Действия с плейлистом")
                }
            }
        }
        .sheet(item: $editing) { playlist in
            PlaylistEditorSheet(mode: .edit(playlist))
        }
        .confirmationDialog("Удалить плейлист?", isPresented: $confirmsDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) {
                guard let playlist = library.playlist(id: playlistID) else { return }
                Task {
                    if await library.deletePlaylist(playlist) { dismiss() }
                }
            }
        } message: {
            Text("Треки останутся в MyCloud, удалится только сам плейлист")
        }
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
                .listRowBackground(ArtworkTintBackground(path: playlist.coverUrl ?? playlist.tracks.first?.coverUrl))
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
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            Task { await library.remove(track, from: playlist) }
                        } label: {
                            Label("Убрать", systemImage: "minus.circle")
                        }
                    }
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
