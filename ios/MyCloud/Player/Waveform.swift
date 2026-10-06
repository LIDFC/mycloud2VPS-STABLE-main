import Foundation
import Observation

/// `GET /api/waveform/:id` — peak amplitudes in 0…1 (200 or 800 points,
/// depending on when the server generated it). Empty while still generating.
struct Waveform: Decodable, Equatable, Sendable {
    let samples: [Double]
    let duration: Double?

    /// Resamples to `count` bars, keeping each bucket's peak so short loud
    /// passages stay visible at any width.
    static func buckets(_ samples: [Double], count: Int) -> [Double] {
        guard count > 0, !samples.isEmpty else { return [] }
        if samples.count == count { return samples.map(clamp) }
        return (0..<count).map { index in
            let start = index * samples.count / count
            let end = max(start + 1, (index + 1) * samples.count / count)
            return clamp(samples[start..<min(end, samples.count)].max() ?? 0)
        }
    }

    private static func clamp(_ value: Double) -> Double {
        value.isFinite ? min(max(value, 0), 1) : 0
    }
}

extension API.Catalog {
    static func waveform(trackID: String) -> Endpoint<Waveform> {
        // Not `.cacheable()`: an empty "still generating" reply must not stick.
        // Real waveforms come with Cache-Control: 30 days, so URLCache keeps them.
        Endpoint(.get, ["api", "waveform", trackID], auth: .none)
    }
}

/// In-memory waveforms by track id; only non-empty results are kept, so a
/// track whose waveform is still being generated is retried next time.
@MainActor
@Observable
final class WaveformStore {
    private(set) var samples: [String: [Double]] = [:]

    @ObservationIgnored private let api: APIClient
    @ObservationIgnored private var inFlight: Set<String> = []

    init(api: APIClient) {
        self.api = api
    }

    func samples(for track: Track) -> [Double]? {
        samples[track.id]
    }

    func load(for track: Track) async {
        guard track.waveformUrl != nil, samples[track.id] == nil, !inFlight.contains(track.id) else { return }
        inFlight.insert(track.id)
        defer { inFlight.remove(track.id) }
        guard let waveform = try? await api.send(API.Catalog.waveform(trackID: track.id)),
              !waveform.samples.isEmpty
        else { return }
        samples[track.id] = waveform.samples
    }
}
