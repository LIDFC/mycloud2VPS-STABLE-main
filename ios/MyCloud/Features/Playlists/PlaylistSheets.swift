import SwiftUI

/// Pick a playlist for a track (or create a new one with it).
struct AddToPlaylistSheet: View {
    let track: Track

    @Environment(AppContainer.self) private var container
    @Environment(\.dismiss) private var dismiss
    @State private var addingTo: String?
    @State private var showsNewPlaylist = false

    private var library: LibraryStore { container.library }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Добавить в плейлист")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Отмена") { dismiss() }
                    }
                }
                .sheet(isPresented: $showsNewPlaylist) {
                    PlaylistEditorSheet(mode: .create(initialTrack: track)) { _ in dismiss() }
                }
                .task {
                    if library.playlists.value == nil { await library.reloadPlaylists() }
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch library.playlists {
        case .idle, .loading:
            LoadingStateView()
        case .failed(let error):
            ErrorStateView(error: error) { await library.reloadPlaylists() }
        case .loaded(let playlists):
            List {
                Section {
                    HStack(spacing: 12) {
                        ArtworkView(path: track.coverUrl, targetSize: 44, cornerRadius: 6, placeholderSeed: track.id)
                            .frame(width: 44, height: 44)
                        VStack(alignment: .leading) {
                            Text(track.title).lineLimit(1)
                            Text(track.artistLine).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                }
                Section {
                    Button {
                        showsNewPlaylist = true
                    } label: {
                        Label("Новый плейлист", systemImage: "plus")
                    }
                    ForEach(playlists) { playlist in
                        let contains = playlist.tracks.contains { $0.id == track.id }
                        Button {
                            add(to: playlist)
                        } label: {
                            HStack {
                                PlaylistRow(playlist: playlist)
                                Spacer()
                                if addingTo == playlist.id {
                                    ProgressView()
                                } else if contains {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.tint)
                                        .accessibilityLabel("Уже добавлен")
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(addingTo != nil || contains)
                    }
                }
            }
        }
    }

    private func add(to playlist: Playlist) {
        addingTo = playlist.id
        Task {
            let added = await library.add(track, to: playlist)
            addingTo = nil
            if added { dismiss() }
        }
    }
}

/// Create a playlist, or edit the name and description of an existing one.
struct PlaylistEditorSheet: View {
    enum Mode {
        case create(initialTrack: Track?)
        case edit(Playlist)
    }

    let mode: Mode
    var onSaved: (Playlist) -> Void = { _ in }

    @Environment(AppContainer.self) private var container
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var isSaving = false
    @FocusState private var nameFocused: Bool

    private var isValid: Bool { name.nilIfBlank != nil && name.count <= 100 }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Название", text: $name)
                        .focused($nameFocused)
                        .submitLabel(.done)
                        .onSubmit(save)
                    TextField("Описание", text: $description, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button(isCreate ? "Создать" : "Сохранить", action: save)
                            .disabled(!isValid)
                    }
                }
            }
            .disabled(isSaving)
            .onAppear {
                if case .edit(let playlist) = mode {
                    name = playlist.name
                    description = playlist.description ?? ""
                }
                nameFocused = true
            }
        }
        .presentationDetents([.medium])
    }

    private var isCreate: Bool {
        if case .create = mode { return true }
        return false
    }

    private var title: LocalizedStringKey {
        isCreate ? "Новый плейлист" : "Изменить плейлист"
    }

    private func save() {
        guard isValid, !isSaving else { return }
        isSaving = true
        Task {
            defer { isSaving = false }
            let library = container.library
            switch mode {
            case .create(let initialTrack):
                guard var playlist = await library.createPlaylist(name: name, description: description) else { return }
                if let initialTrack, await library.add(initialTrack, to: playlist) {
                    playlist = library.playlist(id: playlist.id) ?? playlist
                }
                onSaved(playlist)
                dismiss()
            case .edit(let playlist):
                if await library.updatePlaylist(playlist, name: name, description: description) {
                    onSaved(library.playlist(id: playlist.id) ?? playlist)
                    dismiss()
                }
            }
        }
    }
}
