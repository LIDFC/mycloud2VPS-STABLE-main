import Foundation

enum Format {
    /// `3:45`, `1:02:03`; `nil` for unknown/invalid durations.
    static func duration(_ seconds: Double?) -> String? {
        guard let seconds, seconds.isFinite, seconds >= 0 else { return nil }
        let total = Int(seconds.rounded(.down))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }

    /// Long-form total for album/playlist footers: «1 ч 5 мин», «42 мин».
    static func totalDuration(_ seconds: Double) -> String {
        let minutes = max(1, Int((seconds / 60).rounded()))
        let hours = minutes / 60
        let rest = minutes % 60
        if hours > 0 {
            return rest > 0
                ? String(localized: "\(hours) ч \(rest) мин")
                : String(localized: "\(hours) ч")
        }
        return String(localized: "\(minutes) мин")
    }

    /// «12», «1,2 тыс.», «3,4 млн»
    static func compact(_ value: Int) -> String {
        value.formatted(.number.notation(.compactName).locale(Locale(identifier: "ru_RU")))
    }

    /// «12,3 МБ»
    static func bytes(_ count: Int) -> String {
        Int64(count).formatted(.byteCount(style: .file).locale(Locale(identifier: "ru_RU")))
    }

    static func trackCount(_ count: Int) -> String {
        "\(count) " + RussianPlural.form(count, one: "трек", few: "трека", many: "треков")
    }

    static func albumCount(_ count: Int) -> String {
        "\(count) " + RussianPlural.form(count, one: "альбом", few: "альбома", many: "альбомов")
    }

    static func followers(_ count: Int) -> String {
        compact(count) + " " + RussianPlural.form(count, one: "подписчик", few: "подписчика", many: "подписчиков")
    }

    static func plays(_ count: Int) -> String {
        compact(count) + " " + RussianPlural.form(count, one: "прослушивание", few: "прослушивания", many: "прослушиваний")
    }
}

enum RussianPlural {
    /// 1 трек, 2 трека, 5 треков, 11 треков, 21 трек, 22 трека…
    static func form(_ n: Int, one: String, few: String, many: String) -> String {
        let n = abs(n)
        let lastTwo = n % 100
        let last = n % 10
        if (11...14).contains(lastTwo) { return many }
        switch last {
        case 1: return one
        case 2...4: return few
        default: return many
        }
    }
}
