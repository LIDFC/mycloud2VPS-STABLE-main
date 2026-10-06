import SwiftUI

/// Compact player pinned above the tab bar while something is queued.
struct MiniPlayerView: View {
    enum Style {
        /// Our own floating card (iOS 17–25).
        case card
        /// Inside the system's Liquid Glass tab bar accessory (iOS 26+),
        /// which draws the background itself. `compact` when it sits inline
        /// next to a minimised tab bar.
        case accessory(compact: Bool)
    }

    @Environment(AppContainer.self) private var container
    var style: Style = .card
    var onOpen: () -> Void = {}

    private var isCard: Bool {
        if case .card = style { return true }
        return false
    }

    private var isCompact: Bool {
        if case .accessory(compact: true) = style { return true }
        return false
    }

    private var artworkSize: CGFloat { isCard ? 44 : 32 }

    private var player: PlaybackController { container.player }

    var body: some View {
        if let track = player.currentTrack {
            HStack(spacing: 12) {
                ArtworkView(path: track.coverUrl, targetSize: artworkSize, cornerRadius: isCard ? 6 : artworkSize / 2,
                            placeholderSeed: track.id)
                    .frame(width: artworkSize, height: artworkSize)

                VStack(alignment: .leading, spacing: 1) {
                    Text(track.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if let error = player.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .lineLimit(1)
                    } else if !isCompact {
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

                if !isCompact {
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
            }
            .buttonStyle(.plain)
            .padding(.leading, isCard ? 8 : 12)
            .padding(.trailing, 4)
            .padding(.vertical, isCard ? 8 : 0)
            .background {
                if isCard {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(.regularMaterial)
                        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
                }
            }
            .overlay(alignment: .bottom) {
                GeometryReader { proxy in
                    Capsule()
                        .fill(.tint)
                        .frame(width: proxy.size.width * player.progress, height: 2)
                        .animation(.linear(duration: 0.5), value: player.progress)
                }
                .frame(height: 2)
                .padding(.horizontal, isCard ? 12 : 20)
                .padding(.bottom, isCard ? 1 : 2)
                .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
            .onTapGesture(perform: onOpen)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint("Открыть плеер")
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("miniPlayer")
            .padding(.horizontal, isCard ? 8 : 0)
            .padding(.bottom, isCard ? 6 : 0)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}

#if compiler(>=6.2)
/// The mini player as the iOS 26 tab bar accessory; follows the accessory's
/// placement so it slims down when the tab bar minimises on scroll.
@available(iOS 26.0, *)
struct MiniPlayerAccessory: View {
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement
    var onOpen: () -> Void

    var body: some View {
        MiniPlayerView(style: .accessory(compact: placement == .inline), onOpen: onOpen)
    }
}
#endif
