import SwiftUI

/// Compact player pinned above the tab bar while something is queued.
struct MiniPlayerView: View {
    @Environment(AppContainer.self) private var container
    var onOpen: () -> Void = {}

    private var player: PlaybackController { container.player }

    var body: some View {
        if let track = player.currentTrack {
            HStack(spacing: 12) {
                ArtworkView(path: track.coverUrl, targetSize: 44, cornerRadius: 6, placeholderSeed: track.id)
                    .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 1) {
                    Text(track.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if let error = player.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .lineLimit(1)
                    } else {
                        Text(track.artistLine)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Group {
                    if player.isBuffering {
                        ProgressView()
                            .frame(width: 44, height: 44)
                    } else {
                        Button {
                            player.togglePlayPause()
                        } label: {
                            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                                .font(.title3)
                                .frame(width: 44, height: 44)
                                .contentTransition(.symbolEffect(.replace))
                        }
                        .accessibilityLabel(player.isPlaying ? "Пауза" : "Воспроизвести")
                    }
                }

                Button {
                    player.next()
                } label: {
                    Image(systemName: "forward.fill")
                        .font(.title3)
                        .frame(width: 44, height: 44)
                }
                .disabled(!player.queue.hasNext)
                .accessibilityLabel("Следующий трек")
            }
            .buttonStyle(.plain)
            .padding(.leading, 8)
            .padding(.trailing, 4)
            .padding(.vertical, 8)
            .background {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.regularMaterial)
                    .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
            }
            .overlay(alignment: .bottom) {
                GeometryReader { proxy in
                    Capsule()
                        .fill(.tint)
                        .frame(width: proxy.size.width * player.progress, height: 2)
                        .animation(.linear(duration: 0.5), value: player.progress)
                }
                .frame(height: 2)
                .padding(.horizontal, 12)
                .padding(.bottom, 1)
                .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
            .onTapGesture(perform: onOpen)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint("Открыть плеер")
            .padding(.horizontal, 8)
            .padding(.bottom, 6)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
