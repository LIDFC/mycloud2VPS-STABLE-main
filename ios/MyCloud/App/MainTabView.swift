import SwiftUI

/// The signed-in app: three tabs, each with its own navigation stack.
struct MainTabView: View {
    enum Tab: Hashable {
        case home, search, library
    }

    @Environment(AppContainer.self) private var container
    @State private var selection: Tab = .home

    var body: some View {
        TabView(selection: $selection) {
            NavigationStack {
                HomeView(viewModel: HomeViewModel(api: container.api))
                    .appDestinations()
            }
            .tabItem { Label("Главная", systemImage: "house.fill") }
            .tag(Tab.home)

            NavigationStack {
                SearchView(viewModel: SearchViewModel(api: container.api))
                    .appDestinations()
            }
            .tabItem { Label("Поиск", systemImage: "magnifyingglass") }
            .tag(Tab.search)

            NavigationStack {
                LibraryView()
                    .appDestinations()
            }
            .tabItem { Label("Медиатека", systemImage: "square.stack.fill") }
            .tag(Tab.library)
        }
    }
}
