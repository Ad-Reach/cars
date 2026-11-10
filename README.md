# cars

Лендинг «Ранг Авто» — импорт автомобилей из Китая, Кореи и Японии.

```bash
npm install
npm run dev   # http://localhost:3000
```

Контент и заглушки — `src/data/content.ts`, контакты — `src/data/site.ts`.
Ветки и деплой:
- `main` — разработка.
- `production` — боевой сайт https://rangauto.ru (`.github/workflows/deploy.yml`):
  сборка standalone-сервера → rsync на сервер → переключение симлинка `current` → перезапуск systemd.
  Выкатить: `git push origin main:production` (или merge main → production).

Сервер: Ubuntu, Caddy (HTTPS, автосертификаты Let's Encrypt, www → без www) → Node на 127.0.0.1:3000,
сервис `rangauto`, релизы в `/srv/rangauto/releases`, логи заявок: `journalctl -u rangauto`.

Заявки с форм уходят в Telegram и дублируются на почту из Strapi («Настройки сайта» → email).
Для почты в `/etc/rangauto.env` нужны `SMTP_HOST`, `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (необязательно);
например для mail.ru: `SMTP_HOST=smtp.mail.ru`, логин — ящик, пароль — «пароль для внешних приложений». После правки: `systemctl restart rangauto`.
