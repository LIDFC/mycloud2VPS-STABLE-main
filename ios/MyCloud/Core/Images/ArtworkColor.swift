import SwiftUI
import UIKit

/// A representative colour of a cover, for tinting album and playlist headers.
enum ArtworkColor {
    nonisolated(unsafe) private static let cache = NSCache<NSURL, UIColor>()

    static func color(for url: URL) async -> Color? {
        if let cached = cache.object(forKey: url as NSURL) { return Color(uiColor: cached) }
        guard let image = await ImagePipeline.shared.image(for: url, pixelSize: 64),
              let color = dominantColor(of: image)
        else { return nil }
        cache.setObject(color, forKey: url as NSURL)
        return Color(uiColor: color)
    }

    /// Average of a 12×12 thumbnail, weighting saturated pixels more so the
    /// result isn't a muddy grey, then nudged into a range that reads well
    /// behind text in both light and dark mode.
    static func dominantColor(of image: UIImage) -> UIColor? {
        guard let cgImage = image.cgImage else { return nil }
        let side = 12
        // Let CGContext own the buffer (a `&array` pointer would dangle after init).
        guard let context = CGContext(
            data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.interpolationQuality = .medium
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: side, height: side))
        guard let data = context.data else { return nil }
        let pixels = UnsafeBufferPointer(start: data.assumingMemoryBound(to: UInt8.self), count: side * side * 4)

        var red = 0.0, green = 0.0, blue = 0.0, totalWeight = 0.0
        for index in stride(from: 0, to: pixels.count, by: 4) {
            let r = Double(pixels[index]) / 255
            let g = Double(pixels[index + 1]) / 255
            let b = Double(pixels[index + 2]) / 255
            let maxC = max(r, g, b), minC = min(r, g, b)
            let saturation = maxC > 0 ? (maxC - minC) / maxC : 0
            let weight = 0.15 + saturation * saturation
            red += r * weight
            green += g * weight
            blue += b * weight
            totalWeight += weight
        }
        guard totalWeight > 0 else { return nil }

        var hue: CGFloat = 0, saturation: CGFloat = 0, brightness: CGFloat = 0, alpha: CGFloat = 0
        UIColor(red: red / totalWeight, green: green / totalWeight, blue: blue / totalWeight, alpha: 1)
            .getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha)
        return UIColor(hue: hue,
                       saturation: min(saturation * 1.2, 0.85),
                       brightness: min(max(brightness, 0.35), 0.8),
                       alpha: 1)
    }
}

/// Soft colour wash behind a header, taken from the cover.
struct ArtworkTintBackground: View {
    let path: String?
    @Environment(AppContainer.self) private var container
    @State private var tint: Color?

    var body: some View {
        LinearGradient(
            colors: [(tint ?? .clear).opacity(0.55), (tint ?? .clear).opacity(0.18), .clear],
            startPoint: .top,
            endPoint: .bottom
        )
        .animation(.easeInOut(duration: 0.4), value: tint)
        .task(id: path) {
            guard let url = container.api.mediaURL(for: path) else { return }
            tint = await ArtworkColor.color(for: url)
        }
        .accessibilityHidden(true)
    }
}
