import SwiftUI
import UIKit

/// Cover art from a server-relative path, downsampled to `targetSize` points.
/// Fills whatever frame the parent gives it.
struct ArtworkView: View {
    let path: String?
    var targetSize: CGFloat = 300
    var cornerRadius: CGFloat = 8
    /// Seeds the placeholder colour so missing covers still look distinct.
    var placeholderSeed: String = ""
    /// SF Symbol drawn on the placeholder; `nil` for none (avatars draw initials).
    var placeholderSymbol: String? = "music.note"

    @Environment(AppContainer.self) private var container
    @Environment(\.displayScale) private var displayScale
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            placeholder
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(.primary.opacity(0.06), lineWidth: 0.5)
        }
        .accessibilityHidden(true)
        .task(id: url) { await load() }
    }

    private var url: URL? { container.api.mediaURL(for: path) }
    private var pixelSize: Int { Int(targetSize * displayScale) }

    private func load() async {
        guard let url else {
            image = nil
            return
        }
        if let cached = ImagePipeline.shared.cachedImage(for: url, pixelSize: pixelSize) {
            image = cached
            return
        }
        let loaded = await ImagePipeline.shared.image(for: url, pixelSize: pixelSize)
        guard !Task.isCancelled else { return }
        withAnimation(.easeOut(duration: 0.2)) { image = loaded }
    }

    private var placeholder: some View {
        // Stable across launches (unlike `hashValue`).
        let seed = placeholderSeed.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFFFF }
        let hue = Double(seed % 360) / 360
        return LinearGradient(
            colors: [Color(hue: hue, saturation: 0.35, brightness: 0.55),
                     Color(hue: hue, saturation: 0.45, brightness: 0.35)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay {
            if let placeholderSymbol {
                Image(systemName: placeholderSymbol)
                    .font(.system(size: max(12, targetSize * 0.3), weight: .medium))
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
    }
}
