# MyCloud для iOS

Нативный клиент MyCloud: SwiftUI, iOS 17+, iPhone. Использует существующий
backend (`server/`) без собственной серверной логики.

## Запуск

1. Открыть `ios/MyCloud.xcodeproj` в Xcode 16 или новее.
2. Target **MyCloud** → *Signing & Capabilities* → выбрать свою команду
   (Team). Bundle ID — `baby.dirty.mycloud`, при конфликте поменять.
3. Выбрать симулятор или iPhone и нажать Run.

Тесты: `⌘U` или

```bash
cd ios
xcodebuild test -project MyCloud.xcodeproj -scheme MyCloud \
  -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO
```

## Адрес сервера

Задаётся в `Config/Base.xcconfig` (`API_BASE_URL`), попадает в Info.plist
(`MCAPIBaseURL`) и читается `AppConfig`. По умолчанию —
`https://music.dirty.baby:8443`.

Для локальной разработки создайте `Config/Local.xcconfig` (в git не попадает),
он подключается только в Debug:

```
API_BASE_URL = http:/$()/192.168.1.10:3001
```

> Обычный `http` к не-локальным адресам iOS заблокирует (App Transport Security).

## Архитектура

```
MyCloud/
├── App/            точка входа, AppContainer (сборка зависимостей), RootView
├── Core/
│   ├── Config/     AppConfig — адрес API из Info.plist
│   ├── Networking/ APIClient (URLSession + async/await), Endpoint, API (все эндпоинты), APIError
│   ├── Auth/       KeychainStore, TokenStore (JWT только в Keychain), SessionStore
│   ├── Library/    LibraryStore — лайки и плейлисты, общие для всех экранов
│   ├── Images/     ImagePipeline — кеш обложек (диск + память) с даунсэмплингом
│   ├── Downloads/  DownloadStore (офлайн-треки), NetworkMonitor
│   └── Loadable    состояние загрузки экрана
├── Models/         Codable-модели под реальные ответы сервера
├── Player/         PlaybackController (AVPlayer), PlayQueue, AudioSession, NowPlayingCenter
├── Features/       экраны: View + @Observable ViewModel
├── DesignSystem/   общие компоненты (Loading / Error / Empty states)
└── Resources/      Assets
MyCloudTests/       XCTest + Fixtures/ — реальные ответы сервера
```

- **MVVM** на `@Observable`; ViewModel'и `@MainActor`, получают зависимости через init.
- **APIClient** прикрепляет токен по `AuthRequirement` эндпоинта, переводит
  сетевые ошибки и не-2xx ответы в `APIError` с русскими сообщениями. На 401
  сбрасывает токен, только если он всё ещё текущий.
- **Токен** — только в Keychain (`AfterFirstUnlockThisDeviceOnly`), пароль не
  сохраняется нигде, UserDefaults для секретов не используется.
- Ссылки на медиа сервер отдаёт относительными — `APIClient.mediaURL(for:)`.
- **Офлайн:** ответы каталога кешируются на диск (`ResponseCache`) — экраны
  открываются мгновенно и работают без сети. Загруженные треки лежат в
  Application Support (исключены из бэкапа), плеер берёт локальный файл.
  Кеш и загрузки привязаны к аккаунту: повторный вход тем же пользователем их
  сохраняет, вход другим — удаляет.

## Фазы

| Фаза | Статус |
|---|---|
| 1. Проект, архитектура, API client | ✅ |
| 2. Авторизация (вход и регистрация) | ✅ |
| 3. Home / Library / Search / Album / Artist | ✅ |
| 4. Плеер (AVPlayer, очередь) | ✅ |
| 5. Now Playing + фоновое воспроизведение | ✅ |
| 6. Плейлисты и лайки | ✅ |
| 7. Кеширование и офлайн | ✅ |
| 8. Полировка и тесты | |

CI: `.github/workflows/ios.yml` — сборка и unit-тесты на macOS при изменениях в `ios/`.
