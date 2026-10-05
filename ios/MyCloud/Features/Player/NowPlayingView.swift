import SwiftUI

/// Full-screen player sheet: artwork, scrubber, transport controls and queue.
struct NowPlayingView: View {
    @Environment(AppContainer.self) private var container
    @Environment(\.dismiss) private var dismiss
    @Environment(\.addToPlaylist) private var addToPlaylist
    @State private var showsQueue = false
    @State private var scrubTime: Double?

    private var player: PlaybackController { container.player }

    var body: some View {
        ZStack {
            background
            if let track = player.currentTrack {
                VStack(spacing: 0) {
                    topBar
                    if showsQueue {
                        QueueView()
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    } else {
                        Spacer(minLength: 16)
                        artwork(track)
                            .transition(.scale(scale: 0.9).combined(with: .opacity))
                        Spacer(minLength: 16)
                    }
                    controls(track)
                        .padding(.bottom, 12)
                }
                .padding(.horizontal, 24)
            } else {
                EmptyStateView(title: "Ничего не играет", systemImage: "music.note")
            }
        }
        .animation(.snappy, value: showsQueue)
        .onChange(of: player.currentTrack == nil) { _, isEmpty in
            if isEmpty { dismiss() }
        }
    }

    // MARK: - Parts

    private var background: some View {
        ZStack {
            Color(uiColor: .systemBackground)
            if let track = player.currentTrack {
                ArtworkView(path: track.coverUrl, targetSize: 120, cornerRadius: 0, placeholderSeed: track.id)
                    .scaleEffect(1.6)
                    .blur(radius: 60)
                    .opacity(0.65)
                    .id(track.id)
                    .transition(.opacity)
            }
            Rectangle().fill(.ultraThinMaterial)
        }
        .ignoresSafeArea()
        .animation(.easeInOut(duration: 0.6), value: player.currentTrack?.id)
    }

    private var topBar: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.down")
                    .font(.title3.weight(.semibold))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Свернуть")
            Spacer()
            Text(showsQueue ? "Далее в очереди" : "Сейчас играет")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            Spacer()
            Button {
                showsQueue.toggle()
            } label: {
                Image(systemName: "list.bullet")
                    .font(.title3.weight(.semibold))
                    .frame(width: 44, height: 44)
                    .background(showsQueue ? AnyShapeStyle(.tint.opacity(0.2)) : AnyShapeStyle(.clear), in: Circle())
            }
            .accessibilityLabel(showsQueue ? "Скрыть очередь" : "Показать очередь")
        }
        .foregroundStyle(.primary)
        .padding(.top, 8)
    }

    private func artwork(_ track: Track) -> some View {
        ArtworkView(path: track.coverUrl, targetSize: 360, cornerRadius: 16, placeholderSeed: track.id)
            .aspectRatio(1, contentMode: .fit)
            .frame(maxWidth: 360)
            .scaleEffect(player.isPlaying ? 1 : 0.86)
            .shadow(color: .black.opacity(player.isPlaying ? 0.3 : 0.15), radius: player.isPlaying ? 28 : 14, y: 14)
            .animation(.spring(response: 0.45, dampingFraction: 0.7), value: player.isPlaying)
            .id(track.id)
    }

    private func controls(_ track: Track) -> some View {
        VStack(spacing: 22) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(track.title)
                        .font(.title3.bold())
                        .lineLimit(1)
                    Text(track.artistLine)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentTransition(.opacity)

                LikeButton(track: track, font: .title2)

                Menu {
                    Button {
                        addToPlaylist(track)
                    } label: {
                        Label("Добавить в плейлист…", systemImage: "text.badge.plus")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Ещё")
            }

            if let error = player.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            scrubber

            transport

            secondaryControls
        }
    }

    private var scrubber: some View {
        let duration = max(player.duration, 0)
        let shown = scrubTime ?? player.currentTime
        return VStack(spacing: 6) {
            Slider(
                value: Binding(
                    get: { min(shown, max(duration, 0.01)) },
                    set: { newValue in
                        scrubTime = newValue
                        player.scrub(to: newValue)
                    }
                ),
                in: 0...max(duration, 0.01),
                onEditingChanged: { editing in
                    if editing {
                        player.beginScrubbing()
                    } else {
                        player.endScrubbing(at: scrubTime ?? player.currentTime)
                        scrubTime = nil
                    }
                }
            )
            .disabled(duration <= 0)
            .accessibilityLabel("Позиция")
            .accessibilityValue(Format.duration(shown) ?? "")

            HStack {
                Text(Format.duration(shown) ?? "0:00")
                Spacer()
                Text("-" + (Format.duration(max(duration - shown, 0)) ?? "0:00"))
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
        }
    }

    private var transport: some View {
        HStack {
            Button {
                player.previous()
            } label: {
                Image(systemName: "backward.fill")
                    .font(.system(size: 30))
                    .frame(maxWidth: .infinity, minHeight: 64)
            }
            .accessibilityLabel("Предыдущий трек")

            Button {
                player.togglePlayPause()
            } label: {
                ZStack {
                    if player.isBuffering {
                        ProgressView()
                            .controlSize(.large)
                    } else {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 46))
                            .contentTransition(.symbolEffect(.replace))
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 72)
            }
            .accessibilityLabel(player.isPlaying ? "Пауза" : "Воспроизвести")

            Button {
                player.next()
            } label: {
                Image(systemName: "forward.fill")
                    .font(.system(size: 30))
                    .frame(maxWidth: .infinity, minHeight: 64)
            }
            .disabled(!player.queue.hasNext)
            .accessibilityLabel("Следующий трек")
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
        .sensoryFeedback(.selection, trigger: player.currentTrack?.id)
    }

    private var secondaryControls: some View {
        HStack {
            Button {
                player.toggleShuffle()
            } label: {
                Image(systemName: "shuffle")
                    .foregroundStyle(player.queue.isShuffled ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Перемешать")
            .accessibilityAddTraits(player.queue.isShuffled ? .isSelected : [])

            Spacer()

            Button {
                player.cycleRepeatMode()
            } label: {
                Image(systemName: player.queue.repeatMode == .one ? "repeat.1" : "repeat")
                    .foregroundStyle(player.queue.repeatMode == .off ? AnyShapeStyle(.secondary) : AnyShapeStyle(.tint))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(repeatLabel)
        }
        .font(.title3.weight(.semibold))
        .buttonStyle(.plain)
    }

    private var repeatLabel: LocalizedStringKey {
        switch player.queue.repeatMode {
        case .off: "Повтор выключен"
        case .all: "Повтор очереди"
        case .one: "Повтор трека"
        }
    }
}

/// "Up next" list inside the Now Playing sheet. Tap plays, swipe removes,
/// "Изменить" enables drag-to-reorder.
private struct QueueView: View {
    @Environment(AppContainer.self) private var container
    @State private var editMode: EditMode = .inactive
    private var player: PlaybackController { container.player }

    var body: some View {
        let upNext = player.queue.upNext
        VStack(spacing: 0) {
            if upNext.isEmpty {
                EmptyStateView(title: "Очередь пуста", systemImage: "list.bullet",
                               message: "После этого трека воспроизведение остановится")
            } else {
                HStack {
                    Text(Format.trackCount(upNext.count))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button(editMode.isEditing ? "Готово" : "Изменить") {
                        withAnimation { editMode = editMode.isEditing ? .inactive : .active }
                    }
                    .font(.footnote.weight(.semibold))
                }
                .padding(.vertical, 8)

                List {
                    ForEach(Array(upNext.enumerated()), id: \.offset) { index, track in
                        Button {
                            player.playFromUpNext(index)
                        } label: {
                            TrackRow(track: track)
                        }
                        .buttonStyle(.plain)
                        .disabled(editMode.isEditing)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                    }
                    .onDelete { offsets in
                        offsets.sorted(by: >).forEach { player.removeFromUpNext(at: $0) }
                    }
                    .onMove { source, destination in
                        player.moveUpNext(fromOffsets: source, toOffset: destination)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .environment(\.editMode, $editMode)
            }
        }
        .frame(maxHeight: .infinity)
    }
}
