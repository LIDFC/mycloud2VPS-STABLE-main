import Foundation

/// Pure play-order logic: what's playing, what's next, shuffle and repeat.
/// Kept free of AVFoundation so every rule is unit-tested.
struct PlayQueue: Equatable, Sendable {
    enum RepeatMode: Equatable, Sendable, CaseIterable {
        case off, all, one

        var next: RepeatMode {
            switch self {
            case .off: .all
            case .all: .one
            case .one: .off
            }
        }
    }

    /// Tracks in the order they were queued.
    private(set) var tracks: [Track] = []
    /// Play order: indices into `tracks`.
    private(set) var order: [Int] = []
    /// Position of the current track within `order`.
    private(set) var position = 0
    private(set) var isShuffled = false
    var repeatMode: RepeatMode = .off

    var current: Track? {
        order.indices.contains(position) ? tracks[order[position]] : nil
    }

    var upNext: [Track] {
        guard position + 1 < order.count else { return [] }
        return order[(position + 1)...].map { tracks[$0] }
    }

    var isEmpty: Bool { order.isEmpty }
    var hasNext: Bool { position + 1 < order.count || (repeatMode == .all && !order.isEmpty) }

    // MARK: - Loading

    /// Replaces the queue. Shuffled playback starts from a random track
    /// unless `startIndex` is given explicitly.
    mutating func load<G: RandomNumberGenerator>(
        _ newTracks: [Track], startIndex: Int?, shuffled: Bool, using generator: inout G
    ) {
        tracks = newTracks
        isShuffled = shuffled
        position = 0
        guard !newTracks.isEmpty else {
            order = []
            return
        }
        let indices = Array(newTracks.indices)
        if shuffled {
            let first = startIndex.map { min(max($0, 0), newTracks.count - 1) }
                ?? Int.random(in: 0..<newTracks.count, using: &generator)
            order = [first] + indices.filter { $0 != first }.shuffled(using: &generator)
        } else {
            order = indices
            position = min(max(startIndex ?? 0, 0), newTracks.count - 1)
        }
    }

    mutating func load(_ newTracks: [Track], startIndex: Int?, shuffled: Bool) {
        var generator = SystemRandomNumberGenerator()
        load(newTracks, startIndex: startIndex, shuffled: shuffled, using: &generator)
    }

    // MARK: - Moving

    /// The current track finished on its own.
    /// - Returns: the track to play now, or `nil` when playback should stop.
    mutating func advanceAfterFinish() -> Track? {
        if repeatMode == .one { return current }
        return moveForward()
    }

    /// The user pressed "next". Repeat-one doesn't trap the user on a track.
    mutating func skipForward() -> Track? {
        moveForward()
    }

    /// The user pressed "previous" (and we're near the start of the track).
    /// - Returns: the previous track, or `nil` at the start of a non-repeating queue.
    mutating func skipBackward() -> Track? {
        guard !order.isEmpty else { return nil }
        if position > 0 {
            position -= 1
            return current
        }
        if repeatMode == .all {
            position = order.count - 1
            return current
        }
        return nil
    }

    private mutating func moveForward() -> Track? {
        guard !order.isEmpty else { return nil }
        if position + 1 < order.count {
            position += 1
            return current
        }
        if repeatMode == .all {
            position = 0
            return current
        }
        return nil
    }

    /// Jumps to an entry of `upNext`.
    mutating func jump(toUpNext index: Int) -> Track? {
        let target = position + 1 + index
        guard order.indices.contains(target) else { return nil }
        position = target
        return current
    }

    // MARK: - Shuffle

    mutating func setShuffled<G: RandomNumberGenerator>(_ shuffled: Bool, using generator: inout G) {
        guard shuffled != isShuffled, !order.isEmpty else {
            isShuffled = shuffled
            return
        }
        isShuffled = shuffled
        let currentIndex = order[position]
        if shuffled {
            // Keep what was already played, shuffle only the rest.
            let rest = order[(position + 1)...].shuffled(using: &generator)
            order = Array(order[...position]) + rest
        } else {
            // Back to queue order, continuing from the current track.
            order = Array(tracks.indices)
            position = currentIndex
        }
    }

    mutating func setShuffled(_ shuffled: Bool) {
        var generator = SystemRandomNumberGenerator()
        setShuffled(shuffled, using: &generator)
    }

    // MARK: - Editing

    /// Inserts right after the current track.
    mutating func playNext(_ track: Track) {
        tracks.append(track)
        let index = tracks.count - 1
        if order.isEmpty {
            order = [index]
            position = 0
        } else {
            order.insert(index, at: position + 1)
        }
    }

    /// Adds to the end of the queue.
    mutating func append(_ track: Track) {
        tracks.append(track)
        order.append(tracks.count - 1)
    }

    mutating func removeFromUpNext(at index: Int) {
        let target = position + 1 + index
        guard order.indices.contains(target) else { return }
        order.remove(at: target)
    }

    mutating func moveUpNext(fromOffsets source: IndexSet, toOffset destination: Int) {
        let upcoming = Array(order[(position + 1)...])
        let valid = source.filter { upcoming.indices.contains($0) }
        let moving = valid.map { upcoming[$0] }
        var remaining = upcoming.enumerated().filter { !valid.contains($0.offset) }.map(\.element)
        let insertAt = min(max(0, destination - valid.filter { $0 < destination }.count), remaining.count)
        remaining.insert(contentsOf: moving, at: insertAt)
        order = Array(order[...position]) + remaining
    }

    /// Keeps queued tracks in sync after a like/unlike elsewhere.
    mutating func updateTrack(_ track: Track) {
        for index in tracks.indices where tracks[index].id == track.id {
            tracks[index] = track
        }
    }

    mutating func clear() {
        self = PlayQueue(repeatMode: repeatMode)
    }

    init(repeatMode: RepeatMode = .off) {
        self.repeatMode = repeatMode
    }
}
