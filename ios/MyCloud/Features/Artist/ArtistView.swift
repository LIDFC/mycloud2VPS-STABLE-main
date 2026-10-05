import SwiftUI

struct ArtistView: View {
    @State var viewModel: ArtistViewModel
    @Environment(\.play) private var play

    private static let topLimit = 5

    var body: some View {
        LoadableView(state: viewModel.state, retry: { await viewModel.load() }) { profile in
            let tracks = ArtistViewModel.popularTracks(profile)
            let albums = ArtistViewModel.publishedAlbums(profile)

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    header(profile, tracks: tracks)

                    if tracks.isEmpty && albums.isEmpty {
                        EmptyStateView(title: "Пока нет релизов", systemImage: "music.mic")
                            .frame(minHeight: 200)
                    }

                    if !tracks.isEmpty {
                        popular(tracks)
                    }

                    if !albums.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader(title: String(localized: "Альбомы"), subtitle: Format.albumCount(albums.count))
                            ScrollView(.horizontal, showsIndicators: false) {
                                LazyHStack(alignment: .top, spacing: 14) {
                                    ForEach(albums) { album in
                                        NavigationLink(value: Route.album(id: album.id)) {
                                            AlbumTile(album: album)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                .padding(.horizontal)
                            }
                        }
                    }

                    if let bio = profile.bio, !bio.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeader(title: String(localized: "Об исполнителе"))
                            Text(bio)
                                .font(.body)
                                .foregroundStyle(.secondary)
                                .padding(.horizontal)
                        }
                    }
                }
                .padding(.bottom, 24)
            }
            .refreshable { await viewModel.load() }
        }
        .navigationTitle(viewModel.username)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if viewModel.state.value == nil { await viewModel.load() }
        }
    }

    private func header(_ profile: UserProfile, tracks: [Track]) -> some View {
        VStack(spacing: 14) {
            AvatarView(path: profile.avatarUrl, name: profile.username, size: 128)
                .shadow(color: .black.opacity(0.15), radius: 14, y: 8)

            VStack(spacing: 4) {
                HStack(spacing: 6) {
                    Text(profile.username)
                        .font(.title.bold())
                    if profile.accountType == AccountType.artistPro.rawValue {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(.tint)
                            .accessibilityLabel("Исполнитель Pro")
                    }
                }
                Text([Format.followers(profile.followersCount), Format.plays(profile.totalPlays)].joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if !tracks.isEmpty {
                PlayShuffleButtons(tracks: tracks)
                    .padding(.horizontal)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private func popular(_ tracks: [Track]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader(title: String(localized: "Популярные треки")) {
                if tracks.count > Self.topLimit {
                    NavigationLink(value: Route.tracks(TrackListRoute(
                        title: viewModel.username, subtitle: Format.trackCount(tracks.count), tracks: tracks
                    ))) {
                        Text("Все")
                    }
                }
            }
            VStack(spacing: 0) {
                ForEach(Array(tracks.prefix(Self.topLimit).enumerated()), id: \.element.id) { index, track in
                    Button {
                        play(tracks, startAt: index)
                    } label: {
                        TrackRow(track: track)
                            .padding(.horizontal)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)
                    .contextMenu { TrackContextMenu(track: track) }
                }
            }
        }
    }
}
