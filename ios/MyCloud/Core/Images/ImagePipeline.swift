import Foundation
import ImageIO
import UIKit

/// Loads artwork with a two-level cache:
/// - disk: `URLCache` (HTTP-cached originals; covers are served with `Cache-Control`),
/// - memory: decoded, *downsampled* bitmaps keyed by URL + target pixel size.
///
/// Covers on the server are up to ~1.5 MB PNG/JPEG. Decoding them at full size
/// for a 56-pt row would waste tens of MB, so images are downsampled with ImageIO.
final class ImagePipeline: @unchecked Sendable {
    static let shared = ImagePipeline()

    private let session: URLSession
    private let memory = NSCache<NSString, UIImage>()
    private let lock = NSLock()
    private var inFlight: [String: Task<UIImage?, Never>] = [:]

    init(diskCapacity: Int = 300 * 1024 * 1024) {
        let configuration = URLSessionConfiguration.default
        configuration.urlCache = URLCache(memoryCapacity: 16 * 1024 * 1024, diskCapacity: diskCapacity,
                                          directory: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)
                                              .first?.appendingPathComponent("Artwork", isDirectory: true))
        configuration.requestCachePolicy = .returnCacheDataElseLoad
        configuration.timeoutIntervalForRequest = 30
        session = URLSession(configuration: configuration)
        memory.totalCostLimit = 80 * 1024 * 1024
    }

    func cachedImage(for url: URL, pixelSize: Int) -> UIImage? {
        memory.object(forKey: key(url, pixelSize))
    }

    /// Returns `nil` on failure (artwork is decorative; callers show a placeholder).
    func image(for url: URL, pixelSize: Int) async -> UIImage? {
        let key = key(url, pixelSize)
        if let cached = memory.object(forKey: key) { return cached }

        let task: Task<UIImage?, Never> = lock.withLock {
            if let existing = inFlight[key as String] { return existing }
            let task = Task<UIImage?, Never> { [session] in
                guard let (data, response) = try? await session.data(from: url),
                      let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode)
                else { return nil }
                return Self.downsample(data, maxPixelSize: pixelSize)
            }
            inFlight[key as String] = task
            return task
        }

        let image = await task.value
        lock.withLock { inFlight[key as String] = nil }
        if let image {
            let cost = Int(image.size.width * image.scale * image.size.height * image.scale * 4)
            memory.setObject(image, forKey: key, cost: cost)
        }
        return image
    }

    func clearMemory() {
        memory.removeAllObjects()
    }

    func clearDisk() {
        session.configuration.urlCache?.removeAllCachedResponses()
    }

    var diskUsage: Int {
        session.configuration.urlCache?.currentDiskUsage ?? 0
    }

    private func key(_ url: URL, _ pixelSize: Int) -> NSString {
        "\(pixelSize)|\(url.absoluteString)" as NSString
    }

    static func downsample(_ data: Data, maxPixelSize: Int) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else { return nil }
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: max(1, maxPixelSize),
        ] as CFDictionary
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
