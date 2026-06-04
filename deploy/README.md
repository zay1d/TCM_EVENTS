# Развёртывание TCM Events

Архитектура: статичный фронт на **Cloudflare Pages** + API на **Contabo VPS**
(Node + Express + PostgreSQL за nginx) + документы в **Cloudflare R2**.

```
Браузер ──HTTPS──► Cloudflare Pages (фронт)
   │
   ├──REST API──► VPS: nginx → Node/Express → PostgreSQL
   │
   └──presigned PUT/GET──► Cloudflare R2 (файлы документов)
```

---

## 1. Cloudflare R2 (хранилище документов)

1. В панели Cloudflare → **R2** → создайте bucket, напр. `tcm-events-documents`.
2. **R2 → Manage API Tokens** → создайте токен с доступом на чтение/запись к bucket.
   Сохраните **Access Key ID** и **Secret Access Key**.
3. Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
4. **CORS** для bucket (Settings → CORS policy) — разрешите загрузку из браузера:
   ```json
   [
     {
       "AllowedOrigins": ["https://ВАШ-ФРОНТ.pages.dev"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

## 2. PostgreSQL на VPS

```bash
sudo apt update && sudo apt install -y postgresql
sudo -u postgres psql -c "CREATE USER tcm WITH PASSWORD 'СВОЙ_ПАРОЛЬ';"
sudo -u postgres psql -c "CREATE DATABASE tcm_events OWNER tcm;"
```

## 3. Backend

```bash
sudo apt install -y nodejs npm   # нужен Node 20+; при необходимости через nodesource
sudo git clone <URL_РЕПО> /opt/tcm_events
cd /opt/tcm_events/server
npm install --omit=dev

cp .env.example .env
# заполните .env: DATABASE_URL, R2_*, CORS_ORIGINS (URL фронта)
openssl rand -hex 32                 # → вставьте как JWT_SECRET
npm run hash -- "парольВладельца"    # → вставьте как OWNER_PASSWORD_HASH

npm run migrate                      # создаёт таблицы
```

Запуск как сервис:
```bash
sudo cp /opt/tcm_events/deploy/tcm-events.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tcm-events
sudo systemctl status tcm-events
```

## 4. nginx + TLS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp /opt/tcm_events/deploy/nginx.conf /etc/nginx/sites-available/tcm-events
# отредактируйте server_name на свой домен (напр. api.events.ru)
sudo ln -s /etc/nginx/sites-available/tcm-events /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.ВАШ-ДОМЕН
```

Проверка: `curl https://api.ВАШ-ДОМЕН/api/health` → `{"ok":true}`

## 5. Frontend (Cloudflare Pages)

Подключите репозиторий к Cloudflare Pages (можно приватный), корень фронта — `index.html`,
build command не нужен (статика).

**Один шаг настройки фронта:** в `index.html` найдите блок `TCM CLOUD CONFIG` (вверху, рядом
с `<head>`-логикой) и впишите URL API:

```js
window.TCM_API_BASE = "https://api.ВАШ-ДОМЕН";
```

- Пусто (`""`) → приложение работает автономно, как раньше (сохранение в файл). Ничего не ломается.
- Задан URL → включаются: список ивентов, общий доступ, вход владельца, документы в R2.

Вход владельца — кнопка **«Войти»** в шапке (пароль = тот, чей хэш в `OWNER_PASSWORD_HASH`).
Наблюдатели заходят по ссылке без пароля и видят всё в режиме «только чтение».

---

## API кратко

| Метод | Путь | Доступ |
|---|---|---|
| POST | `/api/auth/login` | пароль владельца → JWT |
| GET | `/api/events` | публично |
| GET | `/api/events/:id` | публично |
| POST/PUT/DELETE | `/api/events[/:id]` | владелец |
| GET | `/api/events/:id/documents` | публично |
| GET | `/api/documents/:id/download` | публично (redirect на R2) |
| POST | `/api/events/:id/documents/presign` | владелец |
| POST | `/api/documents/:id/confirm` | владелец |
| DELETE | `/api/documents/:id` | владелец |
