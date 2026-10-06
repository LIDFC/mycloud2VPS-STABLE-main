import SwiftUI

/// MyCloud's signature control: the track's waveform as the seek bar.
/// Played part in the accent colour; drag anywhere to scrub.
struct WaveformScrubber: View {
    let samples: [Double]
    /// 0…1
    let progress: Double
    let duration: Double
    var onScrubStart: () -> Void = {}
    var onScrub: (_ seconds: Double) -> Void
    var onCommit: (_ seconds: Double) -> Void

    @State private var dragProgress: Double?

    private static let barWidth: CGFloat = 3
    private static let barGap: CGFloat = 2

    private var shownProgress: Double { dragProgress ?? progress }

    var body: some View {
        GeometryReader { proxy in
            let count = max(1, Int(proxy.size.width / (Self.barWidth + Self.barGap)))
            let bars = Waveform.buckets(samples, count: count)
            Canvas { context, size in
                draw(bars, in: size, context: &context)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        if dragProgress == nil { onScrubStart() }
                        let fraction = min(max(value.location.x / max(proxy.size.width, 1), 0), 1)
                        dragProgress = fraction
                        onScrub(fraction * duration)
                    }
                    .onEnded { value in
                        let fraction = min(max(value.location.x / max(proxy.size.width, 1), 0), 1)
                        onCommit(fraction * duration)
                        dragProgress = nil
                    }
            )
        }
        .frame(height: 56)
        .scaleEffect(y: dragProgress == nil ? 1 : 1.12, anchor: .center)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: dragProgress == nil)
        .sensoryFeedback(.selection, trigger: dragProgress == nil)
        .accessibilityElement()
        .accessibilityLabel("Позиция в треке")
        .accessibilityValue(Format.duration(shownProgress * duration) ?? "")
        .accessibilityAdjustableAction { direction in
            let step = 10 / max(duration, 1)
            let target = shownProgress + (direction == .increment ? step : -step)
            onCommit(min(max(target, 0), 1) * duration)
        }
    }

    private func draw(_ bars: [Double], in size: CGSize, context: inout GraphicsContext) {
        guard !bars.isEmpty else { return }
        let step = size.width / CGFloat(bars.count)
        let width = min(Self.barWidth, step * 0.7)
        let playedUpTo = shownProgress * Double(bars.count)
        let minHeight: CGFloat = 3

        for (index, value) in bars.enumerated() {
            let height = max(minHeight, CGFloat(value) * size.height)
            let rect = CGRect(
                x: CGFloat(index) * step + (step - width) / 2,
                y: (size.height - height) / 2,
                width: width,
                height: height
            )
            let path = Path(roundedRect: rect, cornerRadius: width / 2)
            let played = Double(index) + 0.5 <= playedUpTo
            context.fill(path, with: played ? .style(.tint) : .style(.secondary.opacity(0.35)))
        }
    }
}
