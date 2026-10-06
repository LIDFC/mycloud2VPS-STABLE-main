import SwiftUI

struct ArtistView: View {
    @State var viewModel: ArtistViewModel
    @Environment(\.play) private var play
    /// How far the hero has scrolled up (negative) or been pulled down (positive).
    @State private var heroOffset: CGFloat = 0

    private static let topLimit = 5
    private static let bannerHeight: CGFloat = 260
    private static let avatarSize: CGFloat = 112

    /// The banner has scrolled under the navigation bar.
    private var isCollapsed: Bool { heroOffset < -(Self.bannerHeight - 110) }

    var body: some View {
        LoadableView(state: viewModel.state, retry: { await viewModel.load() }) { profile in
            let tracks = ArtistViewModel.popularTracks(profile)
            let albums = ArtistViewModel.publishedAlbums(profile)

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    VStack(spacing: 0) {
                        hero(profile)
                        header(profile, tracks: tracks)
                    }

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
            .coordinateSpace(.scrollView)
            .ignoresSafeArea(edges: .top)
            .onPreferenceChange(HeroOffsetKey.self) { heroOffset = $0 }
            .refreshable { await viewModel.load() }
        }
        .navigationTitle(isCollapsed ? viewModel.username : "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(isCollapsed ? .visible : .hidden, for: .navigationBar)
        .animation(.easeInOut(duration: 0.2), value: isCollapsed)
        .task {
            if viewModel.state.value == nil { await viewModel.load() }
        }
    }

    // MARK: - Hero

    /// Profile background as a banner that stretches when pulled down.
    private func hero(_ profile: UserProfile) -> some View {
        GeometryReader { proxy in
            let minY = proxy.frame(in: .scrollView).minY
            let stretch = max(0, minY)
            banner(profile)
                .frame(width: proxy.size.width, height: Self.bannerHeight + stretch)
                .clipped()
                .offset(y: -stretch)
                .preference(key: HeroOffsetKey.self, value: minY)
        }
        .frame(height: Self.bannerHeight)
    }

    private func banner(_ profile: UserProfile) -> some View {
        ZStack {
            if profile.backgroundUrl != nil {
                ArtworkView(path: profile.backgroundUrl, targetSize: 600, cornerRadius: 0,
                            placeholderSeed: profile.username, placeholderSymbol: nil)
            } else {
                // No banner uploaded: the avatar, blurred, still gives the page colour.
                ArtworkView(path: profile.avatarUrl, targetSize: 120, cornerRadius: 0,
                            placeholderSeed: profile.username, placeholderSymbol: nil)
                    .blur(radius: 40)
                    .scaleEffect(1.4)
            }
            // Legible back button on top, smooth hand-off to the page at the bottom.
            LinearGradient(colors: [.black.opacity(0.35), .clear], startPoint: .top, endPoint: .center)
            LinearGradient(colors: [.clear, Color(uiColor: .systemBackground)], startPoint: .center, endPoint: .bottom)
        }
        .accessibilityHidden(true)
    }

    private func header(_ profile: UserProfile, tracks: [Track]) -> some View {
        VStack(spacing: 14) {
            AvatarView(path: profile.avatarUrl, name: profile.username, size: Self.avatarSize)
                .overlay(Circle().strokeBorder(Color(uiColor: .systemBackground), lineWidth: 4))
                .shadow(color: .black.opacity(0.2), radius: 14, y: 8)
                .padding(.top, -Self.avatarSize / 2 - 20)

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

private struct HeroOffsetKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
