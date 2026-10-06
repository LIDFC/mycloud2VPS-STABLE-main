import SwiftUI

// MARK: - Presenting "Add to playlist"

/// Opens the "add to playlist" sheet; installed by `MainTabView`.
struct AddToPlaylistAction {
    let perform: @MainActor (Track) -> Void

    @MainActor
    func callAsFunction(_ track: Track) { perform(track) }
}

private struct AddToPlaylistActionKey: EnvironmentKey {
    static var defaultValue: AddToPlaylistAction { AddToPlaylistAction { _ in } }
}

extension EnvironmentValues {
    var addToPlaylist: AddToPlaylistAction {
        get { self[AddToPlaylistActionKey.self] }
        set { self[AddToPlaylistActionKey.self] = newValue }
    }
}

// MARK: - Like button

struct LikeButton: View {
    let track: Track
    var font: Font = .title3

    @Environment(AppContainer.self) private var container

    var body: some View {
        let liked = container.library.isLiked(track)
        Button {
            Task { await container.library.toggleLike(track) }
        } label: {
            Image(systemName: liked ? "heart.fill" : "heart")
                .font(font)
                .foregroundStyle(liked ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact(weight: .light), trigger: liked)
        .accessibilityLabel(liked ? "Убрать из любимых" : "Нравится")
    }
}

struct AlbumLikeButton: View {
    let album: Album
    @Environment(AppContainer.self) private var container

    var body: some View {
        let liked = container.library.isLiked(album)
        Button {
            Task { await container.library.toggleLike(album) }
        } label: {
            Image(systemName: liked ? "heart.fill" : "heart")
                .contentTransition(.symbolEffect(.replace))
        }
        .sensoryFeedback(.impact(weight: .light), trigger: liked)
        .accessibilityLabel(liked ? "Убрать альбом из любимых" : "Добавить альбом в любимые")
    }
}

// MARK: - Context menu

/// Context menu shared by every track list.
struct TrackContextMenu: View {
    let track: Track

    @Environment(AppContainer.self) private var container
    @Environment(\.addToPlaylist) private var addToPlaylist

    var body: some View {
        let liked = container.library.isLiked(track)

        Section {
            Button {
                container.player.playNext(track)
            } label: {
                Label("Играть следующим", systemImage: "text.line.first.and.arrowtriangle.forward")
            }
            Button {
                container.player.addToQueue(track)
            } label: {
                Label("Добавить в очередь", systemImage: "text.line.last.and.arrowtriangle.forward")
            }
        }

        Section {
            Button {
                Task { await container.library.toggleLike(track) }
            } label: {
                Label(liked ? "Убрать из любимых" : "Нравится", systemImage: liked ? "heart.slash" : "heart")
            }
            Button {
                addToPlaylist(track)
            } label: {
                Label("Добавить в плейлист…", systemImage: "text.badge.plus")
            }
            TrackDownloadMenuItems(track: track)
        }

        Section {
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
}

// MARK: - Toast

/// Short-lived banner for `LibraryStore.message`.
struct ToastModifier: ViewModifier {
    @Binding var message: String?

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let message {
                Text(message)
                    .font(.subheadline.weight(.medium))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .glassBackground(in: Capsule())
                    .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
                    .padding(.top, 8)
                    .padding(.horizontal, 24)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task(id: message) {
                        try? await Task.sleep(for: .seconds(2.5))
                        withAnimation { self.message = nil }
                    }
                    .onTapGesture { withAnimation { self.message = nil } }
                    .accessibilityAddTraits(.isStaticText)
            }
        }
        .animation(.snappy, value: message)
    }
}

extension View {
    func toast(_ message: Binding<String?>) -> some View {
        modifier(ToastModifier(message: message))
    }
}
