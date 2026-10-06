import SwiftUI

struct SearchView: View {
    @State var viewModel: SearchViewModel
    @Environment(\.play) private var play

    private static let previewLimit = 5

    var body: some View {
        content
            .navigationTitle("Поиск")
            .searchable(text: $viewModel.query, prompt: "Треки, альбомы, исполнители")
            .searchScopes($viewModel.scope, activation: .onSearchPresentation) {
                ForEach(SearchViewModel.Scope.allCases) { scope in
                    Text(scope.title).tag(scope)
                }
            }
            .autocorrectionDisabled()
            .task(id: viewModel.query) { await viewModel.search() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .idle:
            EmptyStateView(title: "Поиск по MyCloud", systemImage: "magnifyingglass",
                           message: "Ищите треки, альбомы и исполнителей")
        case .loading:
            LoadingStateView(title: "Ищем…")
        case .failed(let error):
            ErrorStateView(error: error) { await viewModel.retry() }
        case .loaded(let all):
            let results = viewModel.filtered(all)
            if results.isEmpty {
                ContentUnavailableView.search(text: viewModel.resultsQuery)
            } else {
                resultsList(results)
            }
        }
    }

    private func resultsList(_ results: SearchResults) -> some View {
        List {
            if viewModel.isOfflineResults {
                Label("Нет сети — поиск по загруженным трекам", systemImage: "wifi.slash")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .listRowSeparator(.hidden)
            }
            if !results.artists.isEmpty {
                Section("Исполнители") {
                    ForEach(limited(results.artists)) { artist in
                        NavigationLink(value: Route.artist(username: artist.username)) {
                            ArtistRow(artist: artist)
                        }
                    }
                }
            }
            if !results.albums.isEmpty {
                Section("Альбомы") {
                    ForEach(limited(results.albums)) { album in
                        NavigationLink(value: Route.album(id: album.id)) {
                            AlbumRow(album: album)
                        }
                    }
                }
            }
            if !results.tracks.isEmpty {
                Section {
                    ForEach(Array(limited(results.tracks).enumerated()), id: \.element.id) { index, track in
                        Button {
                            play(results.tracks, startAt: index)
                        } label: {
                            TrackRow(track: track)
                        }
                        .buttonStyle(.plain)
                        .contextMenu { TrackContextMenu(track: track) }
                    }
                } header: {
                    HStack {
                        Text("Треки")
                        Spacer()
                        if viewModel.scope == .all, results.tracks.count > Self.previewLimit {
                            NavigationLink(value: Route.tracks(TrackListRoute(
                                title: viewModel.resultsQuery,
                                subtitle: Format.trackCount(results.tracks.count),
                                tracks: results.tracks
                            ))) {
                                Text("Все \(results.tracks.count)")
                                    .font(.footnote.weight(.medium))
                                    .textCase(nil)
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollDismissesKeyboard(.immediately)
    }

    /// "All" shows a preview of each section; a specific scope shows everything.
    private func limited<T>(_ items: [T]) -> [T] {
        viewModel.scope == .all ? Array(items.prefix(Self.previewLimit)) : items
    }
}

struct ArtistRow: View {
    let artist: ArtistSummary

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(path: artist.avatarUrl, name: artist.username, size: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(artist.username)
                    .font(.body)
                Text(Format.trackCount(artist.trackCount) + " · " + Format.followers(artist.followersCount))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct AlbumRow: View {
    let album: Album

    var body: some View {
        HStack(spacing: 12) {
            ArtworkView(path: album.coverUrl, targetSize: 48, cornerRadius: 6, placeholderSeed: album.id)
                .frame(width: 48, height: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(album.title)
                    .font(.body)
                    .lineLimit(1)
                Text(String(localized: "Альбом · \(album.artist)"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }
}

/// Round avatar with initials fallback.
struct AvatarView: View {
    let path: String?
    let name: String
    var size: CGFloat

    var body: some View {
        ArtworkView(path: path, targetSize: size, cornerRadius: size / 2,
                    placeholderSeed: name, placeholderSymbol: nil)
            .overlay {
                if path == nil {
                    Text(String(name.prefix(1)).uppercased())
                        .font(.system(size: size * 0.42, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white)
                }
            }
            .frame(width: size, height: size)
    }
}
