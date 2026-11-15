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
  leadApiUrl: process.env.LEAD_API_URL ?? "",
  // Необязательно: свой адрес Bot API (прокси/зеркало), если api.telegram.org недоступен.
  apiRoot: process.env.TELEGRAM_API_ROOT || undefined,
  // TELEGRAM_TEST_ENV=1 — тестовый сервер Telegram (отдельный аккаунт и бот из тестового @BotFather).
  // Там виджеты работают, в проде обычным ботам их сейчас запретили (с 13.11.2026).
  testEnv: process.env.TELEGRAM_TEST_ENV === "1",
  catalogOrigin: process.env.CATALOG_ORIGIN ?? "https://catalog.rangauto.ru",
  // Каталог блокирует User-Agent со словом «Bot» — используем тот же, что и сайт
  catalogUserAgent: process.env.CATALOG_USER_AGENT ?? "RangAutoSite/1.0",
  // false — всегда показывать подбор обычными кнопками (без виджетов)
  widgets: process.env.WIDGETS !== "off",
};

if (!config.token) {
  console.error("Нет TELEGRAM_BOT_TOKEN. Скопируйте .env.example в .env и впишите токен.");
  process.exit(1);
}
