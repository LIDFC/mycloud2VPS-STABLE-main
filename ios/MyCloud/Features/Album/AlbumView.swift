import SwiftUI

struct AlbumView: View {
    @State var viewModel: AlbumViewModel
    @Environment(\.play) private var play

    var body: some View {
        LoadableView(state: viewModel.state, retry: { await viewModel.load() }) { album in
            let tracks = album.tracks ?? []
            List {
                Section {
                    header(album, tracks: tracks)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 8, leading: 20, bottom: 16, trailing: 20))
                }

                Section {
                    if tracks.isEmpty {
                        Text("В альбоме пока нет треков")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                        Button {
                            play(tracks, startAt: index)
                        } label: {
                            TrackRow(track: track, number: index + 1)
                        }
                        .buttonStyle(.plain)
                        .contextMenu { TrackContextMenu(track: track) }
                    }
                } footer: {
                    if !tracks.isEmpty {
                        footer(tracks: tracks, album: album)
                    }
                }
            }
            .listStyle(.plain)
            .refreshable { await viewModel.load() }
        }
        .navigationTitle(viewModel.state.value?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if viewModel.state.value == nil { await viewModel.load() }
        }
    }

    private func header(_ album: Album, tracks: [Track]) -> some View {
        VStack(spacing: 16) {
            ArtworkView(path: album.coverUrl, targetSize: 260, cornerRadius: 14, placeholderSeed: album.id)
                .frame(width: 260, height: 260)
                .shadow(color: .black.opacity(0.18), radius: 18, y: 10)

            VStack(spacing: 4) {
                Text(album.title)
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)
                // Albums are created by their owner, so `artist` is the owner's username.
                NavigationLink(value: Route.artist(username: album.artist)) {
                    Text(album.artist)
                        .font(.title3)
                        .foregroundStyle(.tint)
                }
                .buttonStyle(.plain)
                if let meta = metaLine(album) {
                    Text(meta)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            PlayShuffleButtons(tracks: tracks)

            if let description = album.description, !description.isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func metaLine(_ album: Album) -> String? {
        var parts: [String] = []
        if let genre = album.genre, !genre.isEmpty { parts.append(genre) }
        if let year = album.createdAt.map({ Calendar.current.component(.year, from: $0) }) {
            parts.append(String(year))
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func footer(tracks: [Track], album: Album) -> some View {
        var text = Format.trackCount(tracks.count)
        if let total = album.totalDuration {
            text += ", " + Format.totalDuration(total)
        }
        return Text(text)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(.top, 8)
    }
}
