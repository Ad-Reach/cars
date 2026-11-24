// Все настройки — из переменных окружения (файл .env, см. .env.example).

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  token: process.env.TELEGRAM_BOT_TOKEN ?? "",
  // Куда слать заявки: id чатов/групп через запятую. Узнать id — команда /id в нужном чате.
  leadChatIds: list(process.env.LEAD_CHAT_IDS),
  // Необязательно: эндпоинт заявок сайта (https://rangauto.ru/api/lead) — тогда заявка уйдёт
  // туда же, куда заявки с форм сайта (группы + почта). Локально не включать, чтобы не спамить боевые группы.
  // В проде (задан PUBLIC_URL) по умолчанию заявки идут через сайт — он шлёт их в Telegram-группы и на почту.
  // Напрямую почта из Амстердама не работает. LEAD_API_URL="" (пустая строка) — отключить.
  leadApiUrl: process.env.LEAD_API_URL ?? (process.env.PUBLIC_URL ? "https://rangauto.ru/api/lead" : ""),
  // Необязательно: свой адрес Bot API (прокси/зеркало), если api.telegram.org недоступен.
  apiRoot: process.env.TELEGRAM_API_ROOT || undefined,
  // TELEGRAM_TEST_ENV=1 — тестовый сервер Telegram (отдельный аккаунт и бот из тестового @BotFather).
  // Там виджеты работают, в проде обычным ботам их сейчас запретили (с 13.11.2026).
  testEnv: process.env.TELEGRAM_TEST_ENV === "1",
  catalogOrigin: process.env.CATALOG_ORIGIN ?? "https://catalog.rangauto.ru",
  // Каталог блокирует User-Agent со словом «Bot» — используем тот же, что и сайт
  catalogUserAgent: process.env.CATALOG_USER_AGENT ?? "RangAutoSite/1.0",
  // Почта для заявок (как у сайта). Без SMTP_HOST письма не шлются.
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 465),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "",
  },
  leadEmailTo: process.env.LEAD_EMAIL_TO?.trim() || "rangauto@mail.ru",
  // Публичный HTTPS-адрес приложения (технический домен App Platform) — на нём живёт Mini App.
  // Пусто — кнопки Mini App в боте не показываются.
  publicUrl: (process.env.PUBLIC_URL ?? "").replace(/\/$/, ""),
  // MINIAPP_DEV=1 — принимать заявки из Mini App без подписи Telegram (только для локальной проверки в браузере!)
  miniappDev: process.env.MINIAPP_DEV === "1",
  // HTTP-порт: проверка здоровья для App Platform (позже — Mini App)
  port: Number(process.env.PORT ?? 8080),
  // Виджеты Bot API 10.4 выключены: в проде Telegram сейчас запрещает их обычным ботам.
  // WIDGETS=on — включить (например, на тестовом сервере).
  widgets: process.env.WIDGETS === "on",
};

if (!config.token) {
  console.error("Нет TELEGRAM_BOT_TOKEN. Скопируйте .env.example в .env и впишите токен.");
  process.exit(1);
}
