import SwiftUI

// MARK: - Track row

struct TrackRow: View {
    let track: Track
    /// Shows a track number instead of the cover (album screens).
    var number: Int?
    var showsArtwork = true

    var body: some View {
        HStack(spacing: 12) {
            if let number {
                Text("\(number)")
                    .font(.body.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 24, alignment: .center)
            } else if showsArtwork {
                ArtworkView(path: track.coverUrl, targetSize: 48, cornerRadius: 6, placeholderSeed: track.id)
                    .frame(width: 48, height: 48)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(track.title)
                    .font(.body)
                    .lineLimit(1)
                Text(track.artistLine)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            if let duration = Format.duration(track.duration) {
                Text(duration)
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// Context menu shared by every track list.
struct TrackContextMenu: View {
    let track: Track

    var body: some View {
        if let username = track.artistUsername {
            NavigationLink(value: Route.artist(username: username)) {
                Label("Перейти к исполнителю", systemImage: "person.crop.circle")
            }
        }
        if let albumID = track.albumId {
            NavigationLink(value: Route.album(id: albumID)) {
                Label("Перейти к альбому", systemImage: "square.stack")
            }
        }
    }
}

// MARK: - Tiles

struct AlbumTile: View {
    let album: Album
    var width: CGFloat = 160

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ArtworkView(path: album.coverUrl, targetSize: width, cornerRadius: 10, placeholderSeed: album.id)
                .frame(width: width, height: width)
            VStack(alignment: .leading, spacing: 1) {
                Text(album.title)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Text(album.artist)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(width: width, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

struct TrackTile: View {
    let track: Track
    var width: CGFloat = 140

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ArtworkView(path: track.coverUrl, targetSize: width, cornerRadius: 10, placeholderSeed: track.id)
                .frame(width: width, height: width)
                .overlay(alignment: .bottomTrailing) {
                    Image(systemName: "play.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(.ultraThinMaterial, in: Circle())
                        .padding(6)
                }
            VStack(alignment: .leading, spacing: 1) {
                Text(track.title)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Text(track.artistLine)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(width: width, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Section header

struct SectionHeader<Destination: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var destination: () -> Destination

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.title2.bold())
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            destination()
                .font(.subheadline.weight(.medium))
        }
        .padding(.horizontal)
    }
}

extension SectionHeader where Destination == EmptyView {
    init(title: String, subtitle: String? = nil) {
        self.init(title: title, subtitle: subtitle) { EmptyView() }
    }
}

// MARK: - Play / shuffle

struct PlayShuffleButtons: View {
    let tracks: [Track]
    @Environment(\.play) private var play

    var body: some View {
        HStack(spacing: 12) {
            Button {
                play(tracks)
            } label: {
                Label("Слушать", systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
            }
            Button {
                play(tracks, shuffled: true)
            } label: {
                Label("Перемешать", systemImage: "shuffle")
                    .frame(maxWidth: .infinity)
            }
        }
        .font(.headline)
        .buttonStyle(.bordered)
        .buttonBorderShape(.roundedRectangle(radius: 12))
        .controlSize(.large)
        .disabled(tracks.isEmpty)
    }
}
