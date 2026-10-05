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

@MainActor
final class PlaybackControllerTests: XCTestCase {
    private var audio: FakeAudioSession!
    private var player: PlaybackController!

    override func setUp() async throws {
        audio = FakeAudioSession()
        let api = APIClient(baseURL: URL(string: "https://music.dirty.baby:8443")!,
                            session: StubURLProtocol.makeSession(),
                            tokenProvider: { "t" }, unauthorizedHandler: { _ in })
        StubURLProtocol.respond { _ in .init(status: 200, body: .json(#"{"ok":true,"playsCount":1}"#)) }
        player = PlaybackController(api: api, audioSession: audio)
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

    func testRecordsListenOnStart() async throws {
        player.play(try tracks(1), startAt: 0, shuffled: false)
        // recordListen is fire-and-forget on a background task.
        for _ in 0..<50 where !StubURLProtocol.requests.contains(where: { $0.url?.path == "/api/tracks/listen" }) {
            try await Task.sleep(for: .milliseconds(20))
        }
        let request = try XCTUnwrap(StubURLProtocol.requests.first { $0.url?.path == "/api/tracks/listen" })
        XCTAssertEqual(request.httpMethod, "POST")
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
