import SwiftUI

/// The signed-in app: three tabs, each with its own navigation stack, and the
/// mini player pinned above the tab bar.
struct MainTabView: View {
    enum Tab: Hashable {
        case home, search, library
    }

    @Environment(AppContainer.self) private var container
    @State private var selection: Tab = .home
    @State private var showsNowPlaying = false
    @State private var trackForPlaylist: Track?

    var body: some View {
        TabView(selection: $selection) {
            tab(.home, title: "Главная", systemImage: "house.fill") {
                HomeView(viewModel: HomeViewModel(api: container.api))
            }
            tab(.search, title: "Поиск", systemImage: "magnifyingglass") {
                SearchView(viewModel: SearchViewModel(api: container.api) { [downloads = container.downloads] in
                    downloads.downloadedTracks
                })
            }
            tab(.library, title: "Медиатека", systemImage: "square.stack.fill") {
                LibraryView()
            }
        }
        .environment(\.play, PlayAction { [player = container.player] tracks, index, shuffled in
            player.play(tracks, startAt: index, shuffled: shuffled)
        })
        .environment(\.addToPlaylist, AddToPlaylistAction { track in trackForPlaylist = track })
        .sheet(item: $trackForPlaylist) { track in
            AddToPlaylistSheet(track: track)
        }
        .toast(Bindable(container.library).message)
        .animation(.snappy, value: container.player.currentTrack?.id)
        .sheet(isPresented: $showsNowPlaying) {
            NowPlayingView()
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(28)
                // Sheets get their own environment copy: pass the actions on.
                .environment(\.addToPlaylist, AddToPlaylistAction { track in
                    showsNowPlaying = false
                    trackForPlaylist = track
                })
                .toast(Bindable(container.library).message)
        }
    }

    private func tab<Content: View>(
        _ tab: Tab, title: LocalizedStringKey, systemImage: String, @ViewBuilder content: () -> Content
    ) -> some View {
        NavigationStack {
            content()
                .appDestinations()
        }
        // Inside each stack so pushed screens also leave room for the mini player.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                if !container.network.isOnline {
                    OfflineBanner()
                }
                MiniPlayerView { showsNowPlaying = true }
            }
            .animation(.snappy, value: container.network.isOnline)
        }
        .tabItem { Label(title, systemImage: systemImage) }
        .tag(tab)
    }
}
