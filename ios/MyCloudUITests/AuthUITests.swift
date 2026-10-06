import XCTest

/// Smoke tests of the sign-in screen. The app is launched with `-ui-testing`,
/// which gives it empty in-memory storage, so it always starts signed out and
/// these tests never touch the network.
final class AuthUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()
    }

    private var username: XCUIElement { app.textFields["auth.username"] }
    private var password: XCUIElement { app.secureTextFields["auth.password"] }
    private var confirmation: XCUIElement { app.secureTextFields["auth.confirmation"] }
    private var submit: XCUIElement { app.buttons["auth.submit"] }

    func testShowsLoginOnFirstLaunch() {
        XCTAssertTrue(username.waitForExistence(timeout: 10))
        XCTAssertTrue(password.exists)
        XCTAssertTrue(app.staticTexts["MyCloud"].exists)
        XCTAssertFalse(submit.isEnabled, "Empty form can't be submitted")
    }

    func testLoginButtonEnablesWithValidInput() {
        XCTAssertTrue(username.waitForExistence(timeout: 10))
        username.tap()
        username.typeText("listener")
        password.tap()
        password.typeText("secret")
        XCTAssertTrue(submit.isEnabled)
    }

    func testRegistrationValidatesLocally() {
        XCTAssertTrue(username.waitForExistence(timeout: 10))
        app.buttons["auth.modeSwitch"].tap()
        XCTAssertTrue(confirmation.waitForExistence(timeout: 5))

        username.tap()
        username.typeText("bad name")
        password.tap()
        password.typeText("secret")
        confirmation.tap()
        confirmation.typeText("secret")

        let hint = app.staticTexts["auth.hint"]
        XCTAssertTrue(hint.waitForExistence(timeout: 5))
        XCTAssertTrue(hint.label.contains("латинские"), "Got: \(hint.label)")
        XCTAssertFalse(submit.isEnabled)
    }
}
