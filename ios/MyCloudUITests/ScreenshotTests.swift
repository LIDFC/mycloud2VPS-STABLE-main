import XCTest

/// Walks the app like a user and attaches a screenshot of every main screen.
///
/// CI runs this on a small and a large iPhone, in light and dark appearance,
/// and exports the attachments as PNGs. Screens behind sign-in need a test
/// account on the real server, passed as environment variables
/// `MYCLOUD_USERNAME` / `MYCLOUD_PASSWORD` (in CI: `TEST_RUNNER_`-prefixed
/// secrets). Without them only the sign-in screens are captured.
final class ScreenshotTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = true
    }

    func testScreenshotsLight() throws {
        try captureAll(appearance: "light")
    }

    func testScreenshotsDark() throws {
        try captureAll(appearance: "dark")
    }

    // MARK: - Walkthrough

    private func captureAll(appearance: String) throws {
        app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-appearance", appearance]
        app.launch()

        let username = app.textFields["auth.username"]
        XCTAssertTrue(username.waitForExistence(timeout: 15))
        snap("01-login", appearance)

        app.buttons["auth.modeSwitch"].tap()
        _ = app.secureTextFields["auth.confirmation"].waitForExistence(timeout: 5)
        snap("02-register", appearance)
        app.buttons["auth.modeSwitch"].tap()

        let environment = ProcessInfo.processInfo.environment
        guard let login = environment["MYCLOUD_USERNAME"], !login.isEmpty,
              let password = environment["MYCLOUD_PASSWORD"], !password.isEmpty
        else {
            throw XCTSkip("No MYCLOUD_USERNAME / MYCLOUD_PASSWORD: captured sign-in screens only")
        }

        username.tap()
        username.typeText(login)
        let passwordField = app.secureTextFields["auth.password"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["auth.submit"].tap()

        // Home
        let homeTab = app.tabBars.buttons["Главная"]
        XCTAssertTrue(homeTab.waitForExistence(timeout: 30), "Sign-in failed")
        settle(seconds: 4)
        snap("03-home", appearance)
        app.swipeUp()
        settle()
        snap("04-home-scrolled", appearance)
        app.swipeDown()

        // Album → track → artist
        let album = app.buttons.matching(identifier: "albumTile").firstMatch
        if album.waitForExistence(timeout: 10) {
            album.tap()
            settle(seconds: 3)
            snap("05-album", appearance)

            let artistLink = app.buttons["album.artistLink"]
            if artistLink.waitForExistence(timeout: 5) {
                artistLink.tap()
                settle(seconds: 3)
                snap("06-artist", appearance)
                app.navigationBars.buttons.element(boundBy: 0).tap()
                settle()
            }

            let track = app.buttons.matching(identifier: "trackRow").firstMatch
            if track.waitForExistence(timeout: 5) {
                track.tap()
                settle(seconds: 3)
                snap("07-album-playing", appearance)
            }
        }

        // Now Playing + queue
        let miniPlayer = app.otherElements["miniPlayer"]
        if miniPlayer.waitForExistence(timeout: 10) {
            miniPlayer.tap()
            settle(seconds: 3)
            snap("08-now-playing", appearance)
            let queue = app.buttons["nowPlaying.queue"]
            if queue.waitForExistence(timeout: 5) {
                queue.tap()
                settle()
                snap("09-queue", appearance)
            }
            app.swipeDown(velocity: .fast)
            settle()
        }

        // Search
        app.tabBars.buttons["Поиск"].tap()
        settle()
        snap("10-search-empty", appearance)
        let searchField = app.searchFields.firstMatch
        if searchField.waitForExistence(timeout: 5) {
            searchField.tap()
            searchField.typeText("a")
            settle(seconds: 3)
            snap("11-search-results", appearance)
        }

        // Library + settings
        app.tabBars.buttons["Медиатека"].tap()
        settle(seconds: 3)
        snap("12-library", appearance)
        let settings = app.buttons["Настройки"]
        if settings.waitForExistence(timeout: 5) {
            settings.tap()
            settle()
            snap("13-settings", appearance)
        }
    }

    // MARK: - Helpers

    /// Gives artwork and animations time to finish before a screenshot.
    private func settle(seconds: TimeInterval = 1.5) {
        Thread.sleep(forTimeInterval: seconds)
    }

    private func snap(_ name: String, _ appearance: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "\(name)-\(appearance)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
