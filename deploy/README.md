# Деплой MyCloud на music.dirty.baby (HTTPS на :8443)

TCP/443 на сервере занят контейнером `amnezia-telemt` (Telegram-прокси FakeTLS).
**Эта схема его не трогает**: ни контейнер, ни его порты, ни конфиг, ни секреты.

```
Интернет ──:443──▶ amnezia-telemt                 (как было, без изменений)
Интернет ──:8443─▶ mycloud-nginx (TLS, LE cert) ──▶ mycloud:3000 (Node, сеть compose)
127.0.0.1:3000 ──▶ mycloud                         (только локально, для проверок)
:80 — занимается certbot только на время выпуска/продления сертификата
```

Адрес для iOS и браузера: `https://music.dirty.baby:8443`

## 0. Проверки перед установкой (ничего не меняют)

```bash
# 8443, 3000 и 80 должны быть свободны (пустой вывод = свободны)
sudo ss -tlnp | grep -E ':(80|3000|8443)\b'

# telemt — запомнить как эталон, сравним в конце
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
sudo ss -tlnp | grep ':443\b'

# не запущен ли уже MyCloud другим способом (pm2/systemd/старый compose)
pm2 ls 2>/dev/null; systemctl list-units --type=service --all | grep -iE 'mycloud|node'
docker ps -a --format '{{.Names}}' | grep -E '^mycloud' || true

# фаервол хоста и версия compose
sudo ufw status 2>/dev/null; docker compose version
```

Если `ufw` активен — открыть 8443 (и 80 для выпуска сертификата):
`sudo ufw allow 8443/tcp && sudo ufw allow 80/tcp`.
Если у хостера есть свой firewall / security group — открыть там те же порты.

### Если `docker compose` не установлен

**Не обновлять `docker-ce` / `containerd` / `docker.io`**: обновление перезапускает
Docker daemon, а вместе с ним все контейнеры (telemt, synapse и т.д.).
Самый безопасный способ — положить бинарник плагина, daemon при этом не трогается:

```bash
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version
```

(Альтернатива через apt — только после симуляции, что ставится один пакет:
`apt-get install -s docker-compose-plugin` или `apt-get install -s docker-compose-v2`;
если в списке есть `docker-ce`, `containerd` или `docker.io` — не ставить.)

> Порты, опубликованные Docker, обходят ufw. Поэтому backend публикуется
> только на `127.0.0.1:3000` — снаружи он недоступен.

## 1. Сертификат Let's Encrypt

DNS: `music.dirty.baby A 2.26.26.149`, NS — Dynadot (`dyna-ns.net`), CAA нет.

### Вариант 1 (основной): HTTP-01 через порт 80 — с автопродлением

Нужно, чтобы порт 80 был свободен и доступен снаружи.

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone --preferred-challenges http \
  -d music.dirty.baby -m ВАШ_EMAIL --agree-tos --no-eff-email

# перезагрузка nginx после каждого продления
sudo tee /etc/letsencrypt/renewal-hooks/deploy/mycloud-nginx.sh >/dev/null <<'EOF'
#!/bin/sh
docker exec mycloud-nginx nginx -s reload
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/mycloud-nginx.sh

sudo certbot renew --dry-run   # проверка автопродления (systemd timer certbot.timer)
```

certbot поднимает свой HTTP-сервер на :80 только на несколько секунд во время
выпуска/продления; всё остальное время 80 свободен.

### Вариант 2: DNS-01 — если порт 80 занят или закрыт

```bash
sudo certbot certonly --manual --preferred-challenges dns -d music.dirty.baby \
  -m ВАШ_EMAIL --agree-tos --no-eff-email
```

certbot попросит добавить TXT-запись `_acme-challenge.music.dirty.baby` в панели
Dynadot. **Минус: такой сертификат не продлевается автоматически** — повторять
раз в ~60 дней (срок жизни 90). Для автоматизации нужен DNS API Dynadot +
плагин (например, acme.sh) — настроим отдельно, если понадобится.

## 2. Запуск

```bash
cd /путь/к/mycloud2VPS-STABLE-main/deploy
cp .env.example .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env

# данные: ../data, ../uploads, ../waveforms (монтируются в контейнер)
docker compose up -d --build
docker compose ps         # mycloud: healthy, mycloud-nginx: running
```

> Смена `JWT_SECRET` разлогинит всех пользователей (старые токены станут
> недействительны). Если переносите рабочую инсталляцию — используйте прежний секрет.

## 3. Проверка

```bash
# backend локально
curl -s http://127.0.0.1:3000/api/health

# HTTPS снаружи (выполнить с другой машины или телефона)
curl -sI https://music.dirty.baby:8443/api/health
# Range: должен прийти 206 и Content-Range
curl -s -o /dev/null -D - -H 'Range: bytes=0-1' \
  "https://music.dirty.baby:8443/api/stream/$(curl -s https://music.dirty.baby:8443/api/tracks | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["id"])')"

# telemt не изменился: те же Status/Ports, 443 у docker-proxy telemt
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
sudo ss -tlnp | grep ':443\b'
```

И проверить, что Telegram-прокси подключается по старой ссылке.

## Откат

```bash
cd deploy && docker compose down
```

Удаляет только контейнеры `mycloud` / `mycloud-nginx` и их сеть. Данные в
`../data`, `../uploads`, `../waveforms` и сертификат в `/etc/letsencrypt` остаются.
