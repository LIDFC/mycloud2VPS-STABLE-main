import SwiftUI

extension View {
    /// Liquid Glass on iOS 26, the closest material before that.
    func glassBackground<S: Shape>(in shape: S, fallback: Material = .regularMaterial) -> some View {
        modifier(GlassBackground(shape: shape, fallback: fallback))
    }
}

private struct GlassBackground<S: Shape>: ViewModifier {
    let shape: S
    let fallback: Material

    func body(content: Content) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: shape)
        } else {
            content.background(fallback, in: shape)
        }
        #else
        content.background(fallback, in: shape)
        #endif
    }
}
