import SwiftUI

/// A titled, playable list of tracks.
struct TrackListView: View {
    let title: String
    var subtitle: String?
    let tracks: [Track]
    var emptyTitle: LocalizedStringKey = "Здесь пока нет треков"

    @Environment(\.play) private var play

    var body: some View {
        Group {
            if tracks.isEmpty {
                EmptyStateView(title: emptyTitle, systemImage: "music.note.list")
            } else {
                List {
                    Section {
                        VStack(alignment: .leading, spacing: 14) {
                            if let subtitle {
                                Text(subtitle)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            PlayShuffleButtons(tracks: tracks)
                        }
                        .listRowSeparator(.hidden)
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
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle(title)
    }
}
