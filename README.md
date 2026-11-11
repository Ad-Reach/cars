# cars

Лендинг «Ранг Авто» — импорт автомобилей из Китая, Кореи и Японии.

```bash
npm install
npm run dev   # http://localhost:3000
```

Контент и заглушки — `src/data/content.ts`, контакты — `src/data/site.ts`.
Ветки и деплой:
- `main` — разработка.
- `production` — боевой сайт https://rangauto.ru в Timeweb App Platform (Амстердам).
  App Platform сам пересобирает `Dockerfile` при пуше в `production`.
  Выкатывать руками не нужно: зелёный CI на `main` сам продвигает код в `production`.
- Инфраструктура и переменные окружения (Telegram, SMTP, адрес для заявок) — репозиторий `Ad-Reach/infra`.

Контент хранится в коде: `src/data/*.ts`. Отдельной CMS нет.

Заявки с форм уходят в Telegram и дублируются на почту (`LEAD_EMAIL_TO`, по умолчанию email из `src/data/site.ts`).
SMTP: `SMTP_HOST`, `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (необязательно).
