import SwiftUI

/// Hero card at the top of Home: today's 20-track mix.
struct DailyMixCard: View {
    let daily: DailyPlaylist
    @Environment(\.play) private var play

    private var covers: [Track] {
        // Distinct covers, so the fan doesn't show the same image twice.
        var seen = Set<String>()
        return daily.tracks.filter { track in
            guard let cover = track.coverUrl else { return false }
            return seen.insert(cover).inserted
        }
    }

    var body: some View {
        NavigationLink(value: Route.tracks(TrackListRoute(
            title: String(localized: "Микс дня"),
            subtitle: Format.trackCount(daily.tracks.count),
            tracks: daily.tracks
        ))) {
            ZStack(alignment: .bottomLeading) {
                background
                content
            }
            .frame(height: 210)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(0.18), radius: 16, y: 8)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Микс дня, \(Format.trackCount(daily.tracks.count))")
        .accessibilityAction(named: "Слушать") { play(daily.tracks) }
    }

    private var background: some View {
        ZStack {
            ArtworkView(path: covers.first?.coverUrl, targetSize: 160, cornerRadius: 0,
                        placeholderSeed: daily.date ?? "daily", placeholderSymbol: nil)
                .scaleEffect(1.5)
                .blur(radius: 30)
            LinearGradient(colors: [.black.opacity(0.65), .black.opacity(0.15)],
                           startPoint: .leading, endPoint: .trailing)
        }
    }

    private var content: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 6) {
                Text("МИКС ДНЯ")
                    .font(.caption.weight(.bold))
                    .tracking(1.5)
                    .foregroundStyle(.white.opacity(0.8))
                Text(dateTitle)
                    .font(.title.bold())
                    .foregroundStyle(.white)
                Text("\(Format.trackCount(daily.tracks.count)) · обновляется каждый день")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.8))
                    .lineLimit(2)

                Button {
                    play(daily.tracks)
                } label: {
                    Label("Слушать", systemImage: "play.fill")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .background(.tint, in: Capsule())
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                .padding(.top, 6)
            }
            Spacer(minLength: 8)
            coverFan
        }
        .padding(18)
    }

    /// Three covers fanned out on the right.
    private var coverFan: some View {
        ZStack {
            ForEach(Array(covers.prefix(3).enumerated().reversed()), id: \.element.id) { index, track in
                ArtworkView(path: track.coverUrl, targetSize: 96, cornerRadius: 10, placeholderSeed: track.id)
                    .frame(width: 92, height: 92)
                    .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
                    .rotationEffect(.degrees(Double(index) * 8 - 8))
                    .offset(x: CGFloat(index) * -22, y: CGFloat(index) * -6)
            }
        }
        .frame(width: 140, height: 120, alignment: .trailing)
        .accessibilityHidden(true)
    }

    /// «6 октября» from the server's `yyyy-MM-dd`.
    private var dateTitle: String {
        guard let raw = daily.date else { return String(localized: "Сегодня") }
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: raw) else { return String(localized: "Сегодня") }
        return date.formatted(.dateTime.day().month(.wide).locale(Locale(identifier: "ru_RU")))
    }
}
