import SwiftUI

struct AuthView: View {
    @State var viewModel: AuthViewModel
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case username, password, confirmation
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 36) {
                header
                    .padding(.top, 56)

                VStack(spacing: 12) {
                    fields
                    messages
                }

                VStack(spacing: 16) {
                    submitButton
                    modeSwitch
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(background)
        .animation(.snappy, value: viewModel.mode)
        .animation(.snappy, value: viewModel.errorMessage)
        .sensoryFeedback(.error, trigger: viewModel.errorMessage) { _, new in new != nil }
    }

    // MARK: - Parts

    private var header: some View {
        VStack(spacing: 16) {
            Image(systemName: "waveform")
                .font(.system(size: 40, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 88, height: 88)
                .background(.tint, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .shadow(color: .accentColor.opacity(0.35), radius: 16, y: 8)
                .accessibilityHidden(true)

            VStack(spacing: 6) {
                Text("MyCloud")
                    .font(.largeTitle.bold())
                Text(viewModel.mode == .login ? "Войдите, чтобы слушать музыку" : "Создайте аккаунт")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .contentTransition(.opacity)
            }
        }
    }

    @ViewBuilder
    private var fields: some View {
        VStack(spacing: 0) {
            TextField("Имя пользователя", text: $viewModel.username)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.asciiCapable)
                .submitLabel(.next)
                .focused($focusedField, equals: .username)
                .onSubmit { focusedField = .password }
                .authFieldStyle()
                .accessibilityIdentifier("auth.username")

            Divider().padding(.leading, 16)

            SecureField("Пароль", text: $viewModel.password)
                .textContentType(viewModel.mode == .login ? .password : .newPassword)
                .submitLabel(viewModel.mode == .login ? .go : .next)
                .focused($focusedField, equals: .password)
                .onSubmit {
                    if viewModel.mode == .register {
                        focusedField = .confirmation
                    } else {
                        submit()
                    }
                }
                .authFieldStyle()
                .accessibilityIdentifier("auth.password")

            if viewModel.mode == .register {
                Divider().padding(.leading, 16)

                SecureField("Повторите пароль", text: $viewModel.passwordConfirmation)
                    .textContentType(.newPassword)
                    .submitLabel(.go)
                    .focused($focusedField, equals: .confirmation)
                    .onSubmit(submit)
                    .authFieldStyle()
                    .accessibilityIdentifier("auth.confirmation")
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .disabled(viewModel.isSubmitting)
    }

    @ViewBuilder
    private var messages: some View {
        if let error = viewModel.errorMessage {
            Label(error, systemImage: "exclamationmark.circle.fill")
                .accessibilityIdentifier("auth.error")
                .font(.footnote)
                .foregroundStyle(.red)
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity)
        } else if let hint = viewModel.validationMessage {
            Text(hint)
                .accessibilityIdentifier("auth.hint")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity)
        }
    }

    private var submitButton: some View {
        Button(action: submit) {
            ZStack {
                Text(viewModel.mode == .login ? "Войти" : "Зарегистрироваться")
                    .opacity(viewModel.isSubmitting ? 0 : 1)
                if viewModel.isSubmitting {
                    ProgressView()
                        .tint(.white)
                }
            }
            .font(.headline)
            .frame(maxWidth: .infinity)
            .frame(height: 30)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.roundedRectangle(radius: 14))
        .controlSize(.large)
        .disabled(!viewModel.canSubmit)
        .accessibilityIdentifier("auth.submit")
    }

    private var modeSwitch: some View {
        HStack(spacing: 4) {
            Text(viewModel.mode == .login ? "Нет аккаунта?" : "Уже есть аккаунт?")
                .foregroundStyle(.secondary)
            Button(viewModel.mode == .login ? "Зарегистрироваться" : "Войти") {
                viewModel.mode = viewModel.mode == .login ? .register : .login
                viewModel.passwordConfirmation = ""
            }
            .fontWeight(.semibold)
            .accessibilityIdentifier("auth.modeSwitch")
        }
        .font(.subheadline)
        .disabled(viewModel.isSubmitting)
    }

    private var background: some View {
        LinearGradient(
            colors: [Color.accentColor.opacity(0.18), Color(uiColor: .systemBackground)],
            startPoint: .top,
            endPoint: .center
        )
        .ignoresSafeArea()
    }

    private func submit() {
        focusedField = nil
        Task { await viewModel.submit() }
    }
}

private extension View {
    func authFieldStyle() -> some View {
        padding(.horizontal, 16)
            .frame(minHeight: 52)
    }
}
