import XCTest
@testable import MyCloud

@MainActor
private final class FakeAudioSession: AudioSessionControlling {
    var onEvent: ((AudioSessionEvent) -> Void)?
    private(set) var activations = 0
    private(set) var deactivations = 0
    func activate() { activations += 1 }
    func deactivate() { deactivations += 1 }
}

/// Thread-safe list of track IDs reported as listened.
private final class ListenLog: @unchecked Sendable {
    private let lock = NSLock()
    private var ids: [String] = []
    func append(_ id: String) { lock.withLock { ids.append(id) } }
    var all: [String] { lock.withLock { ids } }
}

@MainActor
final class PlaybackControllerTests: XCTestCase {
    private var audio: FakeAudioSession!
    private var listens: ListenLog!
    private var player: PlaybackController!

    override func setUp() async throws {
        audio = FakeAudioSession()
        listens = ListenLog()
        // Media URLs point at an unroutable host: unit tests must never hit the real server.
        let api = APIClient(baseURL: URL(string: "https://mycloud.invalid")!,
                            session: StubURLProtocol.makeSession(),
                            tokenProvider: { "t" }, unauthorizedHandler: { _ in })
        let log = listens!
        player = PlaybackController(api: api, audioSession: audio,
                                    listens: ListenRecorder { log.append($0) })
    }

    override func tearDown() async throws {
        player.stop()
    }

    private func tracks(_ count: Int) throws -> [Track] {
        try (0..<count).map { index in
            try JSONDecoder().decode(Track.self, from: .json(
                #"{"id":"t\#(index)","title":"Track \#(index)","artist":"A","duration":180}"#))
        }
    }

    func testPlayStartsRequestedTrack() throws {
        player.play(try tracks(3), startAt: 1, shuffled: false)
        XCTAssertEqual(player.currentTrack?.id, "t1")
        XCTAssertEqual(player.duration, 180, "Server duration is used until AVPlayer reports one")
        XCTAssertEqual(player.queue.upNext.map(\.id), ["t2"])
        XCTAssertEqual(audio.activations, 1)
    }

    func testRecordsListenOncePerStartedTrack() throws {
        player.play(try tracks(3), startAt: 0, shuffled: false)
        player.next()
        player.togglePlayPause()  // pause/resume must not count another play
        player.togglePlayPause()
        XCTAssertEqual(listens.all, ["t0", "t1"])
    }

    func testNextAndPrevious() throws {
        player.play(try tracks(3), startAt: 0, shuffled: false)
        player.next()
        XCTAssertEqual(player.currentTrack?.id, "t1")
        player.previous()
        XCTAssertEqual(player.currentTrack?.id, "t0")
        player.previous()
        XCTAssertEqual(player.currentTrack?.id, "t0", "Previous at the start restarts the first track")
    }

    func testPreviousRestartsWhenPastThreshold() throws {
        player.play(try tracks(2), startAt: 1, shuffled: false)
        player.seek(to: 30)
        player.previous()
        XCTAssertEqual(player.currentTrack?.id, "t1")
        XCTAssertEqual(player.currentTime, 0)
    }

    func testNextAtEndOfQueueStays() throws {
        player.play(try tracks(2), startAt: 1, shuffled: false)
        player.next()
        XCTAssertEqual(player.currentTrack?.id, "t1")
        XCTAssertFalse(player.queue.hasNext)
    }

    func testQueueEditing() throws {
        let list = try tracks(4)
        player.play(Array(list.prefix(2)), startAt: 0, shuffled: false)
        player.playNext(list[3])
        player.addToQueue(list[2])
        XCTAssertEqual(player.queue.upNext.map(\.id), ["t3", "t1", "t2"])
        player.playFromUpNext(2)
        XCTAssertEqual(player.currentTrack?.id, "t2")
    }

    func testAddToEmptyQueueStartsPlayback() throws {
        player.addToQueue(try tracks(1)[0])
        XCTAssertEqual(player.currentTrack?.id, "t0")
    }

    func testShuffleAndRepeatToggles() throws {
        player.play(try tracks(5), startAt: 2, shuffled: false)
        player.toggleShuffle()
        XCTAssertTrue(player.queue.isShuffled)
        XCTAssertEqual(player.currentTrack?.id, "t2")
        player.cycleRepeatMode()
        XCTAssertEqual(player.queue.repeatMode, .all)
    }

    func testStopClearsEverything() throws {
        player.play(try tracks(2), startAt: 0, shuffled: false)
        player.stop()
        XCTAssertNil(player.currentTrack)
        XCTAssertFalse(player.isPlaying)
        XCTAssertEqual(player.currentTime, 0)
        XCTAssertEqual(audio.deactivations, 1)
    }

    func testOutputDeviceLostPauses() throws {
        player.play(try tracks(1), startAt: 0, shuffled: false)
        audio.onEvent?(.outputDeviceLost)
        XCTAssertFalse(player.isPlaying)
    }

    func testInterruptionWithoutPriorPlaybackDoesNotResume() throws {
        player.play(try tracks(1), startAt: 0, shuffled: false)
        player.pause()
        let before = audio.activations
        audio.onEvent?(.interruptionBegan)
        audio.onEvent?(.interruptionEnded(shouldResume: true))
        XCTAssertEqual(audio.activations, before, "A paused player must stay paused after a call")
    }

    func testInterruptionResumesWhenPlaying() throws {
        player.play(try tracks(1), startAt: 0, shuffled: false)
        let before = audio.activations
        audio.onEvent?(.interruptionBegan)
        audio.onEvent?(.interruptionEnded(shouldResume: true))
        XCTAssertGreaterThan(audio.activations, before)
    }

    func testSeekClampsToDuration() throws {
        player.play(try tracks(1), startAt: 0, shuffled: false)
        player.seek(to: 999)
        XCTAssertEqual(player.currentTime, 180)
        player.seek(to: -5)
        XCTAssertEqual(player.currentTime, 0)
    }
}
