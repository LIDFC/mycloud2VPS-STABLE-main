import XCTest
@testable import MyCloud

/// Deterministic generator so shuffle tests are reproducible.
struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed &+ 0x9E37_79B9_7F4A_7C15 }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

final class PlayQueueTests: XCTestCase {
    private func tracks(_ count: Int) throws -> [Track] {
        try (0..<count).map { index in
            try JSONDecoder().decode(Track.self, from: .json(#"{"id":"t\#(index)","title":"Track \#(index)","artist":"A"}"#))
        }
    }

    private func ids(_ tracks: [Track]) -> [String] { tracks.map(\.id) }

    func testSequentialPlaybackStopsAtEnd() throws {
        var queue = PlayQueue()
        queue.load(try tracks(3), startIndex: 1, shuffled: false)
        XCTAssertEqual(queue.current?.id, "t1")
        XCTAssertEqual(ids(queue.upNext), ["t2"])
        XCTAssertEqual(queue.advanceAfterFinish()?.id, "t2")
        XCTAssertNil(queue.advanceAfterFinish())
        XCTAssertEqual(queue.current?.id, "t2", "Stopping keeps the last track selected")
    }

    func testRepeatAllWraps() throws {
        var queue = PlayQueue(repeatMode: .all)
        queue.load(try tracks(2), startIndex: 1, shuffled: false)
        XCTAssertTrue(queue.hasNext)
        XCTAssertEqual(queue.advanceAfterFinish()?.id, "t0")
        XCTAssertEqual(queue.skipBackward()?.id, "t1")
    }

    func testRepeatOneRepeatsOnlyAutomatically() throws {
        var queue = PlayQueue(repeatMode: .one)
        queue.load(try tracks(3), startIndex: 0, shuffled: false)
        XCTAssertEqual(queue.advanceAfterFinish()?.id, "t0")
        XCTAssertEqual(queue.skipForward()?.id, "t1", "Manual next leaves a repeat-one track")
    }

    func testSkipBackwardAtStart() throws {
        var queue = PlayQueue()
        queue.load(try tracks(3), startIndex: 0, shuffled: false)
        XCTAssertNil(queue.skipBackward())
        XCTAssertEqual(queue.current?.id, "t0")
    }

    func testShuffledLoadKeepsEveryTrackOnce() throws {
        var generator = SeededGenerator(seed: 42)
        var queue = PlayQueue()
        let list = try tracks(20)
        queue.load(list, startIndex: nil, shuffled: true, using: &generator)
        let played = [try XCTUnwrap(queue.current)] + queue.upNext
        XCTAssertEqual(Set(ids(played)), Set(ids(list)))
        XCTAssertEqual(played.count, list.count)
        XCTAssertNotEqual(ids(played), ids(list), "Seeded shuffle should change the order")
    }

    func testShuffledLoadHonoursStartIndex() throws {
        var generator = SeededGenerator(seed: 1)
        var queue = PlayQueue()
        queue.load(try tracks(10), startIndex: 7, shuffled: true, using: &generator)
        XCTAssertEqual(queue.current?.id, "t7")
    }

    func testToggleShuffleKeepsCurrentTrackAndHistory() throws {
        var generator = SeededGenerator(seed: 7)
        var queue = PlayQueue()
        queue.load(try tracks(10), startIndex: 3, shuffled: false)
        _ = queue.skipForward()  // t4
        queue.setShuffled(true, using: &generator)
        XCTAssertEqual(queue.current?.id, "t4")
        XCTAssertEqual(Set(ids(queue.upNext)).count, 5)  // t5…t9 reshuffled
        XCTAssertEqual(queue.skipBackward()?.id, "t3", "Already-played history is kept")

        _ = queue.skipForward()  // back to t4
        queue.setShuffled(false, using: &generator)
        XCTAssertEqual(queue.current?.id, "t4")
        XCTAssertEqual(ids(queue.upNext), ["t5", "t6", "t7", "t8", "t9"])
    }

    func testPlayNextAppendRemoveJump() throws {
        var queue = PlayQueue()
        let list = try tracks(5)
        queue.load(Array(list.prefix(3)), startIndex: 0, shuffled: false)
        queue.playNext(list[4])
        queue.append(list[3])
        XCTAssertEqual(ids(queue.upNext), ["t4", "t1", "t2", "t3"])

        queue.removeFromUpNext(at: 1)
        XCTAssertEqual(ids(queue.upNext), ["t4", "t2", "t3"])

        XCTAssertEqual(queue.jump(toUpNext: 1)?.id, "t2")
        XCTAssertEqual(ids(queue.upNext), ["t3"])
        XCTAssertNil(queue.jump(toUpNext: 5))
    }

    func testPlayNextOnEmptyQueueStartsIt() throws {
        var queue = PlayQueue()
        queue.playNext(try tracks(1)[0])
        XCTAssertEqual(queue.current?.id, "t0")
    }

    func testMoveUpNext() throws {
        var queue = PlayQueue()
        queue.load(try tracks(5), startIndex: 0, shuffled: false)
        queue.moveUpNext(fromOffsets: IndexSet(integer: 3), toOffset: 0)  // t4 to the front
        XCTAssertEqual(ids(queue.upNext), ["t4", "t1", "t2", "t3"])
        queue.moveUpNext(fromOffsets: IndexSet(integer: 0), toOffset: 4)  // and back to the end
        XCTAssertEqual(ids(queue.upNext), ["t1", "t2", "t3", "t4"])
    }

    func testRepeatModeCycle() {
        XCTAssertEqual(PlayQueue.RepeatMode.off.next, .all)
        XCTAssertEqual(PlayQueue.RepeatMode.all.next, .one)
        XCTAssertEqual(PlayQueue.RepeatMode.one.next, .off)
    }

    func testEmptyQueue() {
        var queue = PlayQueue()
        queue.load([], startIndex: 0, shuffled: true)
        XCTAssertNil(queue.current)
        XCTAssertNil(queue.skipForward())
        XCTAssertNil(queue.skipBackward())
        XCTAssertFalse(queue.hasNext)
    }
}
