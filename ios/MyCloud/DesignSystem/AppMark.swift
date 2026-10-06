import SwiftUI

/// The app icon drawn in SwiftUI (gradient cloud with a play mark on a dark
/// tile), for the launch and sign-in screens.
struct AppMark: View {
    var size: CGFloat = 88

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
            .fill(LinearGradient(colors: [Color(red: 0.18, green: 0.12, blue: 0.10),
                                          Color(red: 0.06, green: 0.05, blue: 0.06)],
                                 startPoint: .top, endPoint: .bottom))
            .overlay {
                Image(systemName: "cloud.fill")
                    .font(.system(size: size * 0.5))
                    .foregroundStyle(LinearGradient(colors: [Color(red: 1, green: 0.55, blue: 0.16),
                                                             Color(red: 1, green: 0.33, blue: 0),
                                                             Color(red: 1, green: 0.24, blue: 0.35)],
                                                    startPoint: .top, endPoint: .bottom))
                    .overlay {
                        Image(systemName: "play.fill")
                            .font(.system(size: size * 0.17, weight: .bold))
                            .foregroundStyle(.white)
                            .offset(x: size * 0.015, y: size * 0.03)
                    }
                    .shadow(color: Color(red: 1, green: 0.33, blue: 0).opacity(0.5), radius: size * 0.12)
            }
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}
