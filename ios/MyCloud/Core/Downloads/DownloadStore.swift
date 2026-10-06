import Foundation
import Observation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Tracks saved on the device for offline listening.
///
/// Files live in Application Support (not Caches, so iOS won't purge them),
/// excluded from iCloud backup. An index of track metadata makes the offline
/// library browsable with no network at all.
///
/// Downloads belong to one account: re-signing in as the same user (e.g. after
/// the 7-day token expiry) keeps them; a different user wipes them.
@MainActor
@Observable
final class DownloadStore {
    enum State: Equatable {
        case queued
        case downloading(progress: Double)
        case downloaded
        case failed(String)

        var isActive: Bool {
            switch self {
            case .queued, .downloading: true
            case .downloaded, .failed: false
            }
        }
    }

    struct Entry: Codable, Equatable {
        let track: Track
        let fileName: String
        let bytes: Int
        let downloadedAt: Date
    }

    private struct Index: Codable {
        var ownerID: String?
        var entries: [Entry]
    }

    /// Per-track state; absent means "not downloaded".
    private(set) var states: [String: State] = [:]
    /// Completed downloads, newest first.
    private(set) var entries: [Entry] = []

    var downloadedTracks: [Track] { entries.map(\.track) }
    var totalBytes: Int { entries.reduce(0) { $0 + $1.bytes } }
    var activeCount: Int {
        states.values.filter(\.isActive).count
    }

    static let maxConcurrent = 2

    @ObservationIgnored private let api: APIClient
    @ObservationIgnored private let directory: URL
    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private var ownerID: String?
    @ObservationIgnored private var pending: [Track] = []
    @ObservationIgnored private var running: [String: Task<Void, Never>] = [:]

    init(api: APIClient, directory: URL = DownloadStore.defaultDirectory, session: URLSession? = nil) {
        self.api = api
        self.directory = directory
        self.session = session ?? Self.makeSession()
        prepareDirectory()
        loadIndex()
    }

    nonisolated static var defaultDirectory: URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return support.appendingPathComponent("Downloads", isDirectory: true)
    }

    private static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 60
        configuration.timeoutIntervalForResource = 30 * 60
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        return URLSession(configuration: configuration)
    }

    // MARK: - Account

    func activate(ownerID newOwner: String) {
        guard newOwner != ownerID else { return }
        if ownerID != nil { removeAll() }
        ownerID = newOwner
        saveIndex()
    }

    // MARK: - Queries

    func state(for trackID: String) -> State? { states[trackID] }

    func isDownloaded(_ trackID: String) -> Bool { states[trackID] == .downloaded }

    /// Local file for playback, if the track is fully downloaded.
    func localURL(for track: Track) -> URL? {
        guard let entry = entries.first(where: { $0.track.id == track.id }) else { return nil }
        let url = directory.appendingPathComponent(entry.fileName)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    // MARK: - Actions

    /// Queues tracks that aren't downloaded or in progress yet.
    func download(_ tracks: [Track]) {
        for track in tracks {
            switch states[track.id] {
            case .downloaded, .queued, .downloading:
                continue
            case .failed, nil:
                states[track.id] = .queued
                pending.append(track)
            }
        }
        pump()
    }

    func cancel(_ trackID: String) {
        pending.removeAll { $0.id == trackID }
        running[trackID]?.cancel()
        if states[trackID] != .downloaded { states[trackID] = nil }
    }

    func remove(_ trackID: String) {
        cancel(trackID)
        guard let index = entries.firstIndex(where: { $0.track.id == trackID }) else { return }
        let entry = entries.remove(at: index)
        try? FileManager.default.removeItem(at: directory.appendingPathComponent(entry.fileName))
        states[trackID] = nil
        saveIndex()
    }

    func removeAll() {
        pending.removeAll()
        running.values.forEach { $0.cancel() }
        running.removeAll()
        for entry in entries {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(entry.fileName))
        }
        entries = []
        states = [:]
        saveIndex()
    }

    // MARK: - Queue

    private func pump() {
        while running.count < Self.maxConcurrent, !pending.isEmpty {
            let track = pending.removeFirst()
            running[track.id] = Task { [weak self] in
                await self?.perform(track)
            }
        }
    }

    private func perform(_ track: Track) async {
        defer {
            running[track.id] = nil
            pump()
        }
        guard let url = api.mediaURL(for: track.audioUrl) else {
            states[track.id] = .failed(String(localized: "Не удалось скачать трек"))
            return
        }
        states[track.id] = .downloading(progress: 0)

        do {
            let (temporaryURL, response) = try await fetch(url) { [weak self] fraction in
                Task { @MainActor in
                    guard let self, case .downloading = self.states[track.id] else { return }
                    self.states[track.id] = .downloading(progress: fraction)
                }
            }
            defer { try? FileManager.default.removeItem(at: temporaryURL) }

            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw APIError.server(status: (response as? HTTPURLResponse)?.statusCode ?? 0, message: nil)
            }
            try Task.checkCancellation()

            let fileName = track.id + "." + Self.fileExtension(for: http.mimeType)
            let destination = directory.appendingPathComponent(fileName)
            try? FileManager.default.removeItem(at: destination)
            try FileManager.default.moveItem(at: temporaryURL, to: destination)

            let bytes = (try? destination.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            entries.removeAll { $0.track.id == track.id }
            entries.insert(Entry(track: track, fileName: fileName, bytes: bytes, downloadedAt: Date()), at: 0)
            states[track.id] = .downloaded
            saveIndex()
        } catch {
            if error is CancellationError || (error as? URLError)?.code == .cancelled {
                if states[track.id] != .downloaded { states[track.id] = nil }
                return
            }
            let apiError = APIError(APIClient.mapTransportError(error))
            states[track.id] = .failed(apiError?.localizedDescription ?? String(localized: "Не удалось скачать трек"))
        }
    }

    /// Downloads to a temporary file, reporting progress where the platform allows.
    private nonisolated func fetch(
        _ url: URL, progress: @escaping @Sendable (Double) -> Void
    ) async throws -> (URL, URLResponse) {
        let request = URLRequest(url: url)
        #if canImport(Darwin)
        return try await session.download(for: request, delegate: DownloadProgressDelegate(onProgress: progress))
        #else
        return try await session.download(for: request)
        #endif
    }

    static func fileExtension(for mimeType: String?) -> String {
        switch mimeType?.lowercased() {
        case "audio/mp4", "audio/x-m4a", "audio/m4a": "m4a"
        case "audio/aac": "aac"
        case "audio/wav", "audio/x-wav", "audio/wave": "wav"
        case "audio/flac", "audio/x-flac": "flac"
        case "audio/ogg": "ogg"
        default: "mp3"
        }
    }

    // MARK: - Persistence

    private var indexURL: URL { directory.appendingPathComponent("index.json") }

    private func prepareDirectory() {
        var directory = self.directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? directory.setResourceValues(values)
    }

    private func loadIndex() {
        guard let data = try? Data(contentsOf: indexURL),
              let index = try? JSONDecoder().decode(Index.self, from: data)
        else { return }
        ownerID = index.ownerID
        // Drop entries whose file went missing.
        entries = index.entries.filter {
            FileManager.default.fileExists(atPath: directory.appendingPathComponent($0.fileName).path)
        }
        for entry in entries { states[entry.track.id] = .downloaded }
    }

    private func saveIndex() {
        let index = Index(ownerID: ownerID, entries: entries)
        guard let data = try? JSONEncoder().encode(index) else { return }
        try? data.write(to: indexURL, options: .atomic)
    }
}

#if canImport(Darwin)
/// Observes the task's `Progress` to report download progress.
private final class DownloadProgressDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let onProgress: @Sendable (Double) -> Void
    private var observation: NSKeyValueObservation?
    private var lastReported = -1.0

    init(onProgress: @escaping @Sendable (Double) -> Void) {
        self.onProgress = onProgress
    }

    func urlSession(_ session: URLSession, didCreateTask task: URLSessionTask) {
        observation = task.progress.observe(\.fractionCompleted, options: [.new]) { [weak self] progress, _ in
            guard let self else { return }
            let fraction = progress.fractionCompleted
            // Throttle UI updates to ~2% steps.
            guard fraction - self.lastReported >= 0.02 || fraction >= 1 else { return }
            self.lastReported = fraction
            self.onProgress(fraction)
        }
    }
}
#endif
