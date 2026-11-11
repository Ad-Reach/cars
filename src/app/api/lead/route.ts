import { sendLeadEmail } from "@/lib/mail";
import { sendToAll } from "@/lib/telegram";

// Приём заявок со всех форм сайта: лог + уведомление в Telegram и на почту (см. src/lib/mail.ts).
// Настройки — переменные окружения приложения (задаёт Ad-Reach/infra):
//   TELEGRAM_BOT_TOKEN — токен бота от @BotFather
//   TELEGRAM_CHAT_IDS  — необязательно: чаты, куда слать всегда, через запятую
// Заявки приходят во все группы, куда добавлен бот (см. src/lib/telegram.ts).

type LeadPayload = Record<string, unknown>;

// Подписи полей в сообщении — в порядке вывода
const FIELDS: [key: string, label: string][] = [
  ["topic", "Тема"],
  ["name", "Имя"],
  ["phone", "Телефон"],
  ["contact", "Как связаться"],
  ["city", "Город"],
  ["budget", "Бюджет"],
  ["wishes", "Пожелания"],
  ["comment", "Комментарий"],
];

// Откуда пришла заявка (source из форм) — человеческие названия
const SOURCES: Record<string, string> = {
  header: "Шапка — «Заказать звонок»",
  "mobile-menu": "Мобильное меню — «Заказать звонок»",
  hero: "Первый экран — «Получить расчёт»",
  "how-we-work": "«Как мы работаем» — «Оставить заявку»",
  faq: "FAQ — «Задать вопрос»",
  "personal-selection": "Форма «Персональный подбор»",
  "catalog-empty": "Каталог — подбор под заказ",
};

function sourceLabel(source: string) {
  if (SOURCES[source]) return SOURCES[source];
  if (source.startsWith("promo:")) return `Акция «${source.slice(6)}»`;
  if (source.startsWith("geo:")) return `География — консультация (${source.slice(4).toUpperCase()})`;
  return source || "—";
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clean = (v: unknown) => String(v ?? "").trim().slice(0, 1000);

function formatMessage(data: LeadPayload, digits: string) {
  const lines = ["<b>🚗 Новая заявка с сайта</b>", ""];
  lines.push(`<b>Откуда:</b> ${escapeHtml(sourceLabel(clean(data.source)))}`);
  for (const [key, label] of FIELDS) {
    const value = clean(data[key]);
    if (!value) continue;
    const shown = key === "phone" ? `<a href="tel:+${digits}">${escapeHtml(value)}</a>` : escapeHtml(value);
    lines.push(`<b>${label}:</b> ${shown}`);
  }
  lines.push("", `<i>${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</i>`);
  return lines.join("\n");
}

// Простая защита от спама: не больше 5 заявок в 10 минут с одного IP
const hits = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 5;
}

export async function POST(request: Request) {
  let data: LeadPayload;
  try {
    data = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const digits = clean(data.phone).replace(/\D/g, "");
  if (digits.length !== 11) {
    return Response.json({ ok: false, error: "phone" }, { status: 422 });
  }

  // скрытое поле-ловушка: люди его не видят, боты заполняют
  if (clean(data.website)) return Response.json({ ok: true });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (tooMany(ip)) {
    return Response.json({ ok: false, error: "rate" }, { status: 429 });
  }

  console.log("[lead]", new Date().toISOString(), ip, JSON.stringify(data));
  const message = formatMessage(data, digits);
  const subject = `Заявка с сайта: ${sourceLabel(clean(data.source))}`;
  const [sent, mailed] = await Promise.all([sendToAll(message), sendLeadEmail(subject, message)]);
  if (!sent) console.warn("[lead] telegram: не отправлено (нет настроек или ошибка)");
  if (!mailed) console.warn("[lead] email: не отправлено (нет настроек SMTP или ошибка)");

  // Заявка в любом случае сохранена в логе — пользователю отвечаем успехом
  return Response.json({ ok: true });
}
