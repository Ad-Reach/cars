import { randomUUID } from "node:crypto";
import { enqueueLead, isValidSubmissionId } from "@/lib/amocrm";
import { sendLeadEmail } from "@/lib/mail";
import { sendToAll } from "@/lib/telegram";

// Приём заявок со всех форм сайта: лог + amoCRM (src/lib/amocrm.ts) + Telegram + почта (src/lib/mail.ts).
// Настройки — переменные окружения сервера (/etc/rangauto.env):
//   TELEGRAM_BOT_TOKEN — токен бота от @BotFather
//   TELEGRAM_CHAT_IDS  — ID чатов через запятую (личка менеджера, группа)
//   TELEGRAM_ADMIN_IDS — кто может подключать группы (плюс личные чаты из TELEGRAM_CHAT_IDS)
// Группы, куда бота добавил администратор, подключаются сами (см. src/lib/telegram.ts).

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
  ["vehicle", "Автомобиль"],
];

// Служебные поля — не ответы формы
const SERVICE = new Set(["source", "website", "submissionId", "pageUrl", "referrer", "utm"]);

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

  const submissionId = isValidSubmissionId(clean(data.submissionId)) ? clean(data.submissionId) : randomUUID();
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) if (!SERVICE.has(k) && clean(v)) fields[k] = clean(v);
  const utm: Record<string, string> = {};
  if (data.utm && typeof data.utm === "object") {
    for (const [k, v] of Object.entries(data.utm as Record<string, unknown>)) if (clean(v)) utm[k.slice(0, 50)] = clean(v);
  }

  const isNew = await enqueueLead({
    submissionId,
    source: "rangauto.ru",
    form: sourceLabel(clean(data.source)),
    pageUrl: clean(data.pageUrl),
    name: clean(data.name),
    phone: `+${digits.startsWith("8") ? "7" + digits.slice(1) : digits}`,
    contactMethod: clean(data.contact),
    city: clean(data.city),
    budget: clean(data.budget),
    wishes: [clean(data.wishes), clean(data.comment)].filter(Boolean).join("\n"),
    brand: clean(data.brand),
    model: clean(data.model),
    vehicleName: clean(data.vehicle),
    vehicleUrl: clean(data.vehicleUrl),
    utm,
    fields,
  });
  // повтор той же отправки (двойной клик, переотправка после ошибки сети) — уведомления уже ушли
  if (!isNew) return Response.json({ ok: true });

  const message = formatMessage(data, digits);
  const subject = `Заявка с сайта: ${sourceLabel(clean(data.source))}`;
  const [sent, mailed] = await Promise.all([sendToAll(message), sendLeadEmail(subject, message)]);
  if (!sent) console.warn("[lead] telegram: не отправлено (нет настроек или ошибка)");
  if (!mailed) console.warn("[lead] email: не отправлено (нет настроек SMTP или ошибка)");

  // Заявка в любом случае сохранена в логе — пользователю отвечаем успехом
  return Response.json({ ok: true });
}
