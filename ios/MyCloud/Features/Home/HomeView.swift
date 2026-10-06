import SwiftUI

struct HomeView: View {
    @State var viewModel: HomeViewModel
    @Environment(\.play) private var play

    private static let shelfLimit = 12

    var body: some View {
        LoadableView(
            state: viewModel.state,
            isEmpty: { $0.isEmpty },
            empty: EmptyStateView(title: "Пока здесь пусто", systemImage: "music.note",
                                  message: "Когда на MyCloud появятся треки, они будут здесь"),
            retry: { await viewModel.load() }
        ) { content in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 32) {
                    if let daily = content.daily, !daily.tracks.isEmpty {
                        dailyMix(daily)
                    }
                    if !content.newAlbums.isEmpty {
                        albumShelf(content.newAlbums)
                    }
                    ForEach(content.genres) { group in
                        genreShelf(group)
                    }
                }
                .padding(.vertical)
            }
            .refreshable { await viewModel.load() }
        }
        .navigationTitle("Главная")
        .task {
            if viewModel.state.value == nil { await viewModel.load() }
        }
    }

    // MARK: - Daily mix

    private func dailyMix(_ daily: DailyPlaylist) -> some View {
        DailyMixCard(daily: daily)
            .padding(.horizontal)
    }

    // MARK: - Shelves

    private func albumShelf(_ albums: [Album]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: String(localized: "Новые альбомы"))
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 14) {
                    ForEach(albums) { album in
                        NavigationLink(value: Route.album(id: album.id)) {
                            AlbumTile(album: album)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("albumTile")
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal)
            }
            .scrollTargetBehavior(.viewAligned)
        }
    }

    private func genreShelf(_ group: Recommendations.GenreGroup) -> some View {
        let title = group.genre == "Unknown" ? String(localized: "Разное") : group.genre
        return VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: title, subtitle: Format.trackCount(group.tracks.count)) {
                if group.tracks.count > Self.shelfLimit {
                    NavigationLink(value: Route.tracks(TrackListRoute(
                        title: title, subtitle: Format.trackCount(group.tracks.count), tracks: group.tracks
                    ))) {
                        Text("Все")
                    }
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 14) {
                    ForEach(Array(group.tracks.prefix(Self.shelfLimit).enumerated()), id: \.element.id) { index, track in
                        Button {
                            play(group.tracks, startAt: index)
                        } label: {
                            TrackTile(track: track)
                        }
                        .buttonStyle(.plain)
                        .contextMenu { TrackContextMenu(track: track) }
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal)
            }
            .scrollTargetBehavior(.viewAligned)
        }
    }
}
