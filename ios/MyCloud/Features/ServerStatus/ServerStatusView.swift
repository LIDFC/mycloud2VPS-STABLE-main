import SwiftUI

struct ServerStatusView: View {
    @State var viewModel: ServerStatusViewModel

    var body: some View {
        LoadableView(
            state: viewModel.state,
            isEmpty: { $0.trackCount == 0 },
            empty: EmptyStateView(
                title: "Каталог пуст",
                systemImage: "music.note",
                message: "Сервер доступен, но опубликованных треков пока нет"
            ),
            retry: { await viewModel.load() }
        ) { snapshot in
            List {
                Section("Сервер") {
                    LabeledContent("Адрес", value: viewModel.serverURL.absoluteString)
                    LabeledContent("Статус") {
                        Label("Онлайн", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                    if let uptime = snapshot.uptime {
                        LabeledContent("Аптайм", value: Duration.seconds(uptime).formatted(.units(allowed: [.days, .hours, .minutes], width: .abbreviated)))
                    }
                }
                Section("Каталог") {
                    LabeledContent("Треков", value: snapshot.trackCount, format: .number)
                    LabeledContent("Альбомов", value: snapshot.albumCount, format: .number)
                }
                Section("Новые треки") {
                    ForEach(snapshot.latestTracks) { track in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(track.title)
                                .font(.body)
                                .lineLimit(1)
                            Text(track.artistLine)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
            }
            .refreshable { await viewModel.load() }
        }
        .navigationTitle("MyCloud")
        .task { await viewModel.load() }
    }
}
