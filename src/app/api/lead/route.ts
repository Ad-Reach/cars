import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { amoEnabled } from "@/lib/amocrm";
import { processLead, withLeadLock } from "@/lib/leadCrm";
import { isSubmissionId, markPending, readLead, writeLead, type LeadRecord } from "@/lib/leadJournal";
import { sourceLabel } from "@/lib/leadSources";
import { sendLeadEmail } from "@/lib/mail";
import { sendToAll } from "@/lib/telegram";

// Приём заявок со всех форм сайта: журнал → Telegram и почта → amoCRM (src/lib/leadCrm.ts).
// Настройки — переменные окружения приложения (задаёт Ad-Reach/infra):
//   TELEGRAM_BOT_TOKEN — токен бота от @BotFather
//   TELEGRAM_CHAT_IDS  — необязательно: чаты, куда слать всегда, через запятую
//   AMOCRM_TOKEN       — токен интеграции amoCRM (без него в CRM не отправляем)
// Заявки приходят во все группы, куда добавлен бот (см. src/lib/telegram.ts).
// Форма присылает submission_id (src/lib/lead.ts): повтор той же отправки не дублирует
// ни сообщения, ни сделку — досылается только то, что ещё не доставлено.

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
  const vehicle = data.vehicle as { name?: unknown } | undefined;
  if (vehicle && typeof vehicle === "object" && clean(vehicle.name)) lines.push(`<b>Автомобиль:</b> ${escapeHtml(clean(vehicle.name))}`);
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

const notifying = new Map<string, Promise<[boolean, boolean]>>();

export async function POST(request: Request) {
  let data: LeadPayload;
  try {
    data = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const digits = clean(data.phone).replace(/\D/g, "");
  // Заявки из Telegram-бота: клиент может выбрать «связаться в Telegram» (без телефона) или поделиться чужим номером
  const fromTelegram = clean(data.source).startsWith("telegram") && !!clean(data.contact);
  if (digits.length !== 11 && !fromTelegram) {
    return Response.json({ ok: false, error: "phone" }, { status: 422 });
  }

  // скрытое поле-ловушка: люди его не видят, боты заполняют
  if (clean(data.website)) return Response.json({ ok: true });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (tooMany(ip)) {
    return Response.json({ ok: false, error: "rate" }, { status: 429 });
  }

  delete data.website;
  // Заявки Telegram-бота в amoCRM не идут: подключены только формы сайта (канал «Сайт rangauto.ru»)
  const toCrm = amoEnabled() && !clean(data.source).startsWith("telegram");
  const id = isSubmissionId(data.submission_id) ? data.submission_id : randomUUID();

  // 1. сохраняем заявку до отправки; повтор той же отправки берёт сохранённую запись
  let journaled = true;
  let repeat = false;
  const record: LeadRecord = await withLeadLock(id, async () => {
    try {
      const saved = await readLead(id);
      if (saved) {
        repeat = true;
        return saved;
      }
    } catch (error) {
      journaled = false;
      console.error("[lead] журнал: чтение", id, error);
    }
    const fresh: LeadRecord = { id, receivedAt: new Date().toISOString(), ip, payload: data };
    if (toCrm) fresh.amo = { state: "pending", attempts: 0 };
    if (journaled) {
      try {
        await writeLead(fresh);
        if (toCrm) await markPending(id, true);
      } catch (error) {
        journaled = false;
        console.error("[lead] журнал: запись", id, error);
      }
    }
    return fresh;
  });
  console.log("[lead]", new Date().toISOString(), ip, id, repeat ? "повтор" : "новая", JSON.stringify(data));

  // 2. Telegram и почта — только если ещё не ушли
  const payload = record.payload;
  const message = formatMessage(payload, clean(payload.phone).replace(/\D/g, ""));
  const subject = `Заявка с сайта: ${sourceLabel(clean(payload.source))}`;
  // двойной клик/повтор, пока первая отправка ещё идёт, ждёт её же
  let notify = notifying.get(id);
  if (!notify) {
    notify = Promise.all([record.telegram || sendToAll(message), record.email || sendLeadEmail(subject, message)]);
    notifying.set(id, notify);
    void notify.finally(() => notifying.delete(id));
  }
  const [sent, mailed] = await notify;
  if (!sent) console.warn("[lead] telegram: не отправлено (нет настроек или ошибка)", id);
  if (!mailed) console.warn("[lead] email: не отправлено (нет настроек SMTP или ошибка)", id);
  if (journaled && (sent !== !!record.telegram || mailed !== !!record.email)) {
    // под блокировкой и по свежей копии: обработка amoCRM могла уже дописать свои ID
    await withLeadLock(id, async () => {
      const fresh = (await readLead(id)) ?? record;
      fresh.telegram = fresh.telegram || sent;
      fresh.email = fresh.email || mailed;
      await writeLead(fresh);
    }).catch((error) => console.error("[lead] журнал: запись", id, error));
  }

  // 3. amoCRM — после ответа клиенту; недоставленное дошлёт фоновый обход (startAmoSweeper)
  if (toCrm && journaled) after(() => processLead(id, { force: true }));
  else if (toCrm) console.error("[lead] журнал недоступен — заявка в amoCRM не отправлена, только в логе", id);

  // Заявка в любом случае сохранена в логе — пользователю отвечаем успехом
  return Response.json({ ok: true, submission_id: id });
}
