# RoadSync — PostgreSQL + NextAuth Edition

Бортовий журнал для водіїв-міжнародників. Повна міграція з Firebase на PostgreSQL + NextAuth v5.

## Що змінилось (порівняно з Firebase версією)

| Firebase | PostgreSQL + NextAuth |
|---|---|
| Firebase Auth (Google) | NextAuth v5 + Google Provider |
| Firestore (real-time) | PostgreSQL + REST API (polling) |
| Firebase Storage | — (фото не завантажується; розширити вручну) |
| Google Drive backup | — (видалено; можна додати пізніше) |
| Genkit AI flows | — (видалено; можна підключити окремо) |

## Швидкий старт (локально)

### 1. Встановити залежності
```bash
npm install
```

### 2. Налаштувати змінні середовища
```bash
cp .env.example .env.local
# Заповнити .env.local
```

### 3. Google OAuth
1. Перейти на [console.cloud.google.com](https://console.cloud.google.com)
2. Створити проект → APIs & Services → Credentials → OAuth 2.0 Client
3. Authorized redirect URI: `http://localhost:9002/api/auth/callback/google`
4. Скопіювати Client ID і Client Secret у `.env.local`

### 4. Запустити PostgreSQL (через Docker)
```bash
docker run --name roadsync-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=roadsync -p 5432:5432 -d postgres:16-alpine
```

### 5. Застосувати схему БД
```bash
psql postgresql://postgres:password@localhost:5432/roadsync -f schema.sql
```

### 6. Запустити додаток
```bash
npm run dev
# Відкрити http://localhost:9002
```

## Docker Compose (повний стек)

```bash
cp .env.example .env
# Заповнити .env

docker compose up --build
# Відкрити http://localhost:3000
```

## Деплой на VPS / Railway / Render

1. Встановити PostgreSQL базу даних (наприклад, Railway Postgres або Supabase)
2. Застосувати `schema.sql` до бази
3. Встановити змінні середовища:
   - `DATABASE_URL`
   - `AUTH_SECRET` (згенерувати: `openssl rand -base64 32`)
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `NEXTAUTH_URL` (ваш домен, наприклад `https://roadsync.example.com`)
4. Додати redirect URI в Google Console: `https://ваш-домен/api/auth/callback/google`
5. Збудувати та запустити:
```bash
npm run build
npm start
```

## Структура проекту

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/  # NextAuth handler
│   │   ├── cadences/            # CRUD каденцій
│   │   ├── trips/               # CRUD рейсів
│   │   ├── action-logs/         # Журнал дій
│   │   ├── expenses/            # Витрати
│   │   └── addresses/           # Адресна книга
│   ├── login/                   # Сторінка входу
│   ├── addresses/               # Адресна книга
│   ├── settings/                # Налаштування
│   └── page.tsx                 # Головна сторінка
├── components/                  # UI компоненти
├── hooks/
│   ├── use-api.ts              # Базовий REST хук
│   ├── use-user.ts             # NextAuth сесія
│   ├── use-active-cadence.ts   # Активна каденція
│   ├── use-shift-status.ts     # Статус зміни
│   └── use-trips.ts            # Рейси
└── lib/
    ├── auth.ts                 # NextAuth конфіг
    ├── db.ts                   # PostgreSQL pool
    └── types.ts                # TypeScript типи
```

## Примітки

- **Фото/файли**: `PhotoInput` компонент збережено, але завантаження на Google Drive видалено. Для збереження файлів підключіть S3, Cloudflare R2 або інше сховище.
- **AI функції**: Genkit AI (розпізнавання тахографа, геокодування) видалено разом з Firebase. Функції UI збережено, але без AI backend.
- **Реальний час**: Замість Firestore слухачів використовується polling кожні 8-10 секунд через `useApi`. Для реального часу можна додати WebSockets або Server-Sent Events.
