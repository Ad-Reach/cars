# Telegram-бот заявок «Ранг Авто»

Ленивый подбор: бюджет и руль в один тап → машины из catalog.rangauto.ru → «Хочу эту» → номер одной кнопкой → заявка менеджерам.
Подбор — обычными кнопками. Виджеты Bot API 10.4 готовы, но выключены (`WIDGETS=on`): в проде Telegram сейчас запрещает их обычным ботам.

```bash
cd bot
npm install
cp .env.example .env   # вписать TELEGRAM_BOT_TOKEN и LEAD_CHAT_IDS
npm run dev
```

Куда приходят заявки: добавьте бота в группу менеджеров, напишите там `/id`, впишите id в `LEAD_CHAT_IDS`.
Под заявкой — кнопки статуса; они обновляют карточку заявки у клиента.

Правила и устройство проекта — в [AGENTS.md](AGENTS.md).

## Деплой

Timeweb App Platform, Амстердам, самый дешёвый backend-тариф. Настройки и секреты — в `Ad-Reach/infra` (`terraform/bot.tf`).
Пуш в `main` → App Platform собирает `bot/Dockerfile` и перезапускает бота. Заявки: чаты `LEAD_CHAT_IDS` + почта (SMTP).
