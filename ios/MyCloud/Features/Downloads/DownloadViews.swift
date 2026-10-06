import SwiftUI

/// Small status glyph next to a track: progress ring while downloading,
/// a filled arrow once it's available offline.
struct DownloadIndicator: View {
    let trackID: String
    @Environment(AppContainer.self) private var container

    var body: some View {
        switch container.downloads.state(for: trackID) {
        case .downloaded:
            Image(systemName: "arrow.down.circle.fill")
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Загружен")
        case .downloading(let progress):
            ProgressRing(progress: progress)
                .frame(width: 14, height: 14)
                .accessibilityLabel("Загружается")
                .accessibilityValue("\(Int(progress * 100))%")
        case .queued:
            ProgressRing(progress: 0)
                .frame(width: 14, height: 14)
                .accessibilityLabel("В очереди на загрузку")
        case .failed:
            Image(systemName: "exclamationmark.circle")
                .font(.caption)
                .foregroundStyle(.orange)
                .accessibilityLabel("Ошибка загрузки")
        case nil:
            EmptyView()
        }
    }
}

struct ProgressRing: View {
    let progress: Double

    var body: some View {
        ZStack {
            Circle().stroke(.secondary.opacity(0.3), lineWidth: 2)
            Circle()
                .trim(from: 0, to: max(0.02, progress))
                .stroke(.tint, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.linear(duration: 0.2), value: progress)
        }
    }
}

/// Context-menu items for one track's offline copy.
struct TrackDownloadMenuItems: View {
    let track: Track
    @Environment(AppContainer.self) private var container

    var body: some View {
        let downloads = container.downloads
        switch downloads.state(for: track.id) {
        case .downloaded:
            Button(role: .destructive) {
                downloads.remove(track.id)
            } label: {
                Label("Удалить загрузку", systemImage: "trash")
            }
        case .downloading, .queued:
            Button {
                downloads.cancel(track.id)
            } label: {
                Label("Отменить загрузку", systemImage: "xmark.circle")
            }
        case .failed, nil:
            Button {
                downloads.download([track])
            } label: {
                Label("Скачать", systemImage: "arrow.down.circle")
            }
        }
    }
}

/// Toolbar button for albums and playlists: download everything / shows progress.
struct DownloadAllButton: View {
    let tracks: [Track]
    @Environment(AppContainer.self) private var container
    @State private var confirmsRemoval = false

    var body: some View {
        let downloads = container.downloads
        let downloaded = tracks.filter { downloads.isDownloaded($0.id) }.count
        let active = tracks.contains { downloads.state(for: $0.id)?.isActive == true }

        Group {
            if active {
                ProgressRing(progress: tracks.isEmpty ? 0 : Double(downloaded) / Double(tracks.count))
                    .frame(width: 20, height: 20)
                    .accessibilityLabel("Загружается: \(downloaded) из \(tracks.count)")
            } else if downloaded == tracks.count, !tracks.isEmpty {
                Button {
                    confirmsRemoval = true
                } label: {
                    Image(systemName: "arrow.down.circle.fill")
                }
                .accessibilityLabel("Загружено. Удалить загрузки")
            } else {
                Button {
                    downloads.download(tracks)
                } label: {
                    Image(systemName: "arrow.down.circle")
                }
                .disabled(tracks.isEmpty)
                .accessibilityLabel("Скачать всё")
            }
        }
        .confirmationDialog("Удалить загруженные треки?", isPresented: $confirmsRemoval, titleVisibility: .visible) {
            Button("Удалить с устройства", role: .destructive) {
                tracks.forEach { downloads.remove($0.id) }
            }
        } message: {
            Text("Треки останутся в MyCloud, их можно будет скачать снова")
        }
    }
}

/// Everything available offline, plus downloads in progress.
struct DownloadsView: View {
    @Environment(AppContainer.self) private var container
    @Environment(\.play) private var play
    @State private var confirmsRemoveAll = false

    private var downloads: DownloadStore { container.downloads }

    var body: some View {
        let tracks = downloads.downloadedTracks
        Group {
            if tracks.isEmpty && downloads.activeCount == 0 {
                EmptyStateView(title: "Нет загрузок", systemImage: "arrow.down.circle",
                               message: "Скачайте треки, альбомы или плейлисты, чтобы слушать без интернета")
            } else {
                List {
                    if !tracks.isEmpty {
                        Section {
                            PlayShuffleButtons(tracks: tracks)
                                .listRowSeparator(.hidden)
                        }
                    }
                    if downloads.activeCount > 0 {
                        Section("Загружаются") {
                            Text(Format.trackCount(downloads.activeCount))
                                .foregroundStyle(.secondary)
                        }
                    }
                    Section {
                        ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                            Button {
                                play(tracks, startAt: index)
                            } label: {
                                TrackRow(track: track)
                            }
                            .buttonStyle(.plain)
                            .contextMenu { TrackContextMenu(track: track) }
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    downloads.remove(track.id)
                                } label: {
                                    Label("Удалить", systemImage: "trash")
                                }
                            }
                        }
                    } footer: {
                        if !tracks.isEmpty {
                            Text(Format.trackCount(tracks.count) + " · " + Format.bytes(downloads.totalBytes))
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Загруженные")
        .toolbar {
            if !tracks.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Удалить все", role: .destructive) { confirmsRemoveAll = true }
                }
            }
        }
        .confirmationDialog("Удалить все загрузки?", isPresented: $confirmsRemoveAll, titleVisibility: .visible) {
            Button("Удалить \(Format.bytes(downloads.totalBytes))", role: .destructive) {
                downloads.removeAll()
            }
        }
    }
}

/// Slim notice shown above the mini player while offline.
struct OfflineBanner: View {
    var body: some View {
        Label("Нет сети · доступны загруженные треки", systemImage: "wifi.slash")
            .font(.footnote.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(.regularMaterial, in: Capsule())
            .padding(.bottom, 6)
            .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}
