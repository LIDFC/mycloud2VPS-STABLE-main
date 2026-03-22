# MyCloud 🎵

Самохостируемый музыкальный стриминг на **React + Vite + Express**.
Данные хранятся в JSON-файлах на диске, файлы — в `data/`.

---

## Структура проекта

```
mycloud/
├── server/
│   ├── server.js               — Express API (порт 3001)
│   ├── services/
│   │   └── waveformGenerator.js — генерация waveform через FFmpeg
│   ├── routes/
│   │   ├── stream.js           — HTTP Range streaming
│   │   ├── waveform.js         — отдача JSON waveform
│   │   └── tracks.js           — каталог треков, лайки, репосты
│   ├── data/
│   │   ├── users.json          — пользователи (хеши паролей, роли)
│   │   ├── tracks.json         — треки, лайки, статусы
│   │   └── notifications.json  — уведомления
│   ├── uploads/
│   │   ├── tracks/             — mp3 файлы
│   │   ├── covers/             — обложки
│   │   └── avatars/            — аватары пользователей
│   └── waveforms/              — pre-generated JSON waveform data
├── client/
│   ├── src/
│   │   ├── api.js              — все запросы к бэкенду
│   │   ├── context/            — AuthContext, PlayerContext, NotificationContext
│   │   ├── components/         — Navbar, TrackCard, Player, ArtistCard, ...
│   │   └── pages/              — Home, Liked, Radio, ProfilePage, Admin, Auth
│   └── vite.config.js
├── package.json                — корневой (concurrently)
└── nginx.conf
```

---

## Быстрый старт

### 1. Установить зависимости

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Установить FFmpeg (для waveform-генерации)

FFmpeg нужен для автоматической генерации формы волны при загрузке треков.
Без него приложение работает нормально, но waveform не отображается.

**Ubuntu / Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
ffmpeg -version  # проверка
```

**macOS (Homebrew):**
```bash
brew install ffmpeg
ffmpeg -version
```

**Windows:**
1. Скачай с [ffmpeg.org/download.html](https://ffmpeg.org/download.html) (раздел Windows builds)
2. Распакуй архив, например в `C:\ffmpeg`
3. Добавь `C:\ffmpeg\bin` в системную переменную `PATH`:
   - Win + R → `sysdm.cpl` → Дополнительно → Переменные среды
   - В "Path" добавь `C:\ffmpeg\bin`
4. Перезапусти терминал и проверь: `ffmpeg -version`

> **Без FFmpeg** waveform-полоска в полном плеере будет пустой (обычный прогресс-бар). Всё остальное работает.

### 3. Запустить оба процесса

```bash
# Из корня проекта:
npm install        # concurrently
npm run dev

# Или раздельно:
# Терминал 1:
cd server && node server.js

# Терминал 2:
cd client && npm run dev
```

- Фронтенд: http://localhost:5173
- API:       http://localhost:3001/api

> **Первый зарегистрированный пользователь автоматически становится администратором.**

---

## Функциональность

### Роли пользователей
| Роль | Возможности |
|------|------------|
| **Listener** | Слушать треки, лайкать, репостить, следить за артистами |
| **Artist** | Всё выше + загружать треки (через модерацию) |
| **Admin** | Всё выше + одобрять/отклонять треки, управлять пользователями |

### Треки
- HTTP Range streaming — быстрая перемотка без полной загрузки
- Server-side waveform через FFmpeg — генерируется один раз при загрузке
- Play count — считается каждое прослушивание
- Рекомендации по жанрам — на основе истории прослушиваний

### Поиск
- Ищет одновременно по **трекам** (название, артист, жанр) и **артистам** (ник, bio)
- Результаты разбиты на вкладки: All / Tracks / Artists
- Дебаунс 280мс — не нагружает сервер при быстром вводе

### Профили
- `/profile/:username` — страница артиста или слушателя
- Клик на имя артиста в карточке трека → переход на профиль
- Follow/Unfollow прямо из карточки или профиля

### Модерация
- Артист загружает трек → статус `pending`
- Администратор видит вкладку **Pending** в панели
- Approve → `published`, Reject (с причиной) → `rejected`
- Артист получает уведомление в колокольчике

---

## API эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/stream/:trackId` | HTTP Range streaming mp3 |
| GET | `/api/waveform/:trackId` | Pre-generated waveform JSON |
| GET | `/api/tracks` | Список опубликованных треков |
| GET | `/api/search?q=...` | Поиск треков и артистов |
| GET | `/api/recommendations` | Рекомендации по жанрам |
| POST | `/api/tracks/:id/like` | Лайк/анлайк |
| POST | `/api/tracks/:id/repost` | Репост/убрать репост |
| POST | `/api/listen` | Записать прослушивание |
| GET | `/api/users/:username` | Профиль пользователя |
| POST | `/api/users/:username/follow` | Подписаться/отписаться |

---

## Сборка для продакшена

```bash
cd client && npm run build
# Файлы в client/dist/ — сервер отдаёт их автоматически

cd ../server && node server.js
```

### nginx (опционально)

```bash
scp -r . user@server:/var/www/mycloud/
ssh user@server "cd /var/www/mycloud/server && npm install --production"
sudo cp nginx.conf /etc/nginx/sites-available/mycloud
sudo ln -sf /etc/nginx/sites-available/mycloud /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# pm2 для автозапуска
npm install -g pm2
pm2 start server/server.js --name mycloud
pm2 save && pm2 startup
```

---

## Переменные окружения

Создай файл `server/.env`:

```env
PORT=3001
JWT_SECRET=замени_на_длинную_случайную_строку_минимум_32_символа
```

---

## Безопасность (продакшен)

- Смени `JWT_SECRET` на длинную случайную строку
- Добавь HTTPS через certbot / Let's Encrypt
- В `server.js` замени `origin: "http://localhost:5173"` на свой домен
