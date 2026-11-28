import {
  AmoError,
  addLeadNote,
  amoEnabled,
  createContact,
  createLead,
  findContactsByPhone,
  findLeadByMark,
  findLeadNote,
  phoneDigits,
} from "@/lib/amocrm";
import { listPending, markPending, readLead, writeLead, type AmoStep, type LeadRecord } from "@/lib/leadJournal";
import { sourceLabel } from "@/lib/leadSources";

// Доставка заявки с сайта в amoCRM: контакт → новая сделка → полное примечание.
// Шаги идемпотентны по submission_id: ID созданных сущностей пишутся в журнал (src/lib/leadJournal.ts)
// после каждого шага, повтор досылает только недоставленный шаг. Если исход POST неизвестен
// (таймаут, обрыв, 5xx), перед повтором ищем уже созданное: сделку — по submission_id в поле
// «Основание канала», примечание — по «ID заявки» в тексте, контакт — повторным поиском по телефону.
// Временные ошибки повторяет фоновый обход (startAmoSweeper), 400/401/403 — в журнал для разбора.

const PIPELINE_ID = 11385330; // «Продажа авто»
const STATUS_ID = 89205286; // «Новая заявка — ведёт ИИ»; дальнейшие переходы — автоматика amoCRM
const SITE = "rangauto.ru";
const SITE_URL = "https://rangauto.ru";

const F = {
  channel: 1825294, // Канал поступления (select)
  channelBasis: 1825296, // Основание канала (text)
  brand: 1477031,
  model: 1477033,
  budget: 1477037, // numeric
  city: 1477041,
  requirements: 1477043, // textarea
  lotUrl: 1477073, // url
};
const CHANNEL_SITE = 1196442; // «Сайт rangauto.ru»

const MAX_ATTEMPTS = 30; // ~сутки с учётом растущей паузы
const SWEEP_MS = 60_000;

const str = (v: unknown, max = 1000) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");

function httpUrl(v: unknown) {
  const s = str(v, 2000);
  if (!s) return "";
  try {
    const u = new URL(s, SITE_URL);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/** Бюджет числом — только если в поле одно число (с пробелами/₽). «3 млн», «до 2,5» и т.п. — только в примечание. */
function numericBudget(raw: string) {
  const s = raw.replace(/₽|руб\.?|р\.?$/gi, "").trim();
  if (!/^\d[\d\s ]*$/.test(s)) return null;
  const n = Number(s.replace(/\D/g, ""));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Нормализованные данные заявки (только то, что пришло в форме). */
export function leadFields(rec: LeadRecord) {
  const p = rec.payload;
  const vehicle = (p.vehicle && typeof p.vehicle === "object" ? p.vehicle : {}) as Record<string, unknown>;
  const utmRaw = (p.utm && typeof p.utm === "object" ? p.utm : {}) as Record<string, unknown>;
  const utm = Object.fromEntries(
    Object.entries(utmRaw)
      .filter(([k]) => /^[a-z_]{2,32}$/.test(k))
      .map(([k, v]) => [k, str(v, 300)])
      .filter(([, v]) => v),
  );
  const digits = phoneDigits(str(p.phone));
  const formSource = str(p.source, 300);
  return {
    submissionId: rec.id,
    formSource,
    formLabel: sourceLabel(formSource),
    pageUrl: httpUrl(p.page_url),
    name: str(p.name, 200),
    phone: digits.length === 11 ? `+${digits}` : "",
    contactMethod: str(p.contact, 200),
    city: str(p.city, 200),
    budget: str(p.budget, 200),
    wishes: str(p.wishes),
    comment: str(p.comment),
    topic: str(p.topic, 300),
    vehicleName: str(vehicle.name, 300),
    vehicleUrl: httpUrl(vehicle.url),
    vehicleBrand: str(vehicle.brand, 200),
    vehicleModel: str(vehicle.model, 200),
    utm,
  };
}

type Fields = ReturnType<typeof leadFields>;

function channelBasis(f: Fields) {
  const tail = `; submission_id=${f.submissionId}`;
  const head = `Форма ${SITE} (${f.formLabel.slice(0, 100)})`;
  const url = f.pageUrl ? `; ${f.pageUrl}` : "";
  return (head + tail + url).slice(0, 255);
}

export function leadPayload(f: Fields, contactId: number | null) {
  const cf: Record<string, unknown>[] = [
    { field_id: F.channel, values: [{ enum_id: CHANNEL_SITE }] },
    { field_id: F.channelBasis, values: [{ value: channelBasis(f) }] },
  ];
  const text = (field_id: number, value: string) => value && cf.push({ field_id, values: [{ value }] });
  text(F.brand, f.vehicleBrand);
  text(F.model, f.vehicleModel);
  const budget = numericBudget(f.budget);
  if (budget) cf.push({ field_id: F.budget, values: [{ value: budget }] });
  text(F.city, f.city);
  text(F.requirements, [f.wishes, f.comment].filter(Boolean).join("\n").slice(0, 10000));
  text(F.lotUrl, f.vehicleUrl);
  return {
    name: `Заявка ${SITE} — ${f.name || f.phone}`.slice(0, 255),
    pipeline_id: PIPELINE_ID,
    status_id: STATUS_ID,
    custom_fields_values: cf,
    ...(contactId ? { _embedded: { contacts: [{ id: contactId, is_main: true }] } } : {}),
  };
}

export const noteMark = (id: string) => `ID заявки: ${id}`;

export function noteText(f: Fields, rec: LeadRecord) {
  const v = (s: string) => s || "—";
  const formFields = Object.fromEntries(
    Object.entries(rec.payload).filter(([k]) => !["website", "submission_id", "utm", "page_url"].includes(k)),
  );
  const lines = [];
  const ambiguous = rec.amo?.ambiguous_contacts;
  if (ambiguous?.length) {
    lines.push(
      `⚠ Найдено несколько контактов с телефоном ${f.phone}: ${ambiguous.join(", ")}. Контакт не привязан автоматически — проверьте и привяжите вручную.`,
      "",
    );
  }
  lines.push(
    noteMark(f.submissionId),
    `Источник: ${SITE}`,
    `Форма: ${v(f.formLabel)}`,
    `Страница: ${v(f.pageUrl)}`,
    `Автомобиль: ${v(f.vehicleName)}`,
    `Ссылка на автомобиль: ${v(f.vehicleUrl)}`,
    `Имя: ${v(f.name)}`,
    `Телефон: ${v(f.phone)}`,
    `Способ связи: ${v(f.contactMethod)}`,
    `Город: ${v(f.city)}`,
    `Бюджет: ${v(f.budget)}`,
    `Пожелания: ${v(f.wishes)}`,
  );
  if (f.comment) lines.push(`Комментарий: ${f.comment}`);
  if (f.topic) lines.push(`Заголовок формы: ${f.topic}`);
  lines.push(
    `UTM: ${Object.keys(f.utm).length ? JSON.stringify(f.utm) : "—"}`,
    `Получена: ${new Date(rec.receivedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК`,
    `Все поля формы: ${JSON.stringify(formFields)}`,
  );
  return lines.join("\n");
}

// --- обработка ---

// Все изменения одной записи журнала — строго по очереди (обработка amoCRM, отметки Telegram/почты)
const locks = new Map<string, Promise<unknown>>();

export function withLeadLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const p = prev.then(fn, fn);
  const tail = p.catch(() => {});
  locks.set(id, tail);
  void tail.then(() => locks.get(id) === tail && locks.delete(id));
  return p;
}

const running = new Map<string, Promise<void>>();

/** Доставить заявку в amoCRM (или дослать недоставленное). Повторный вызов во время обработки ждёт её же. */
export function processLead(id: string, opts: { force?: boolean } = {}) {
  const prev = running.get(id);
  if (prev) return prev;
  const p = withLeadLock(id, () => run(id, opts.force ?? false)).finally(() => running.delete(id));
  running.set(id, p);
  return p;
}

async function run(id: string, force: boolean) {
  if (!amoEnabled()) return;
  const rec = await readLead(id);
  if (!rec?.amo) return;
  const amo = rec.amo;
  if (amo.state !== "pending") {
    if (amo.state === "done") await markPending(id, false).catch(() => {});
    return;
  }
  if (!force && amo.nextAttemptAt && Date.parse(amo.nextAttemptAt) > Date.now()) return;

  const f = leadFields(rec);
  const save = () => writeLead(rec);
  const settle = (step: AmoStep) => (amo.uncertain = (amo.uncertain ?? []).filter((s) => s !== step));
  let step: AmoStep = "contact";

  try {
    // 1. контакт: единственное точное совпадение — берём как есть, нет — создаём, несколько — не объединяем
    if (!amo.contact_id && !amo.ambiguous_contacts) {
      const matches = await findContactsByPhone(f.phone);
      if (matches.length === 1) amo.contact_id = matches[0];
      else if (matches.length > 1) amo.ambiguous_contacts = matches;
      else amo.contact_id = await createContact(f.name || f.phone, f.phone);
      settle("contact");
      await save();
    }

    // 2. новая сделка (обычный /leads, не комплексный импорт)
    step = "lead";
    if (!amo.lead_id) {
      if (amo.uncertain?.includes("lead")) amo.lead_id = (await findLeadByMark(F.channelBasis, `submission_id=${id}`)) ?? undefined;
      if (!amo.lead_id) amo.lead_id = await createLead(leadPayload(f, amo.contact_id ?? null));
      settle("lead");
      await save();
    }

    // 3. полный текст заявки — примечанием к сделке
    step = "note";
    if (!amo.note_id) {
      if (amo.uncertain?.includes("note")) amo.note_id = (await findLeadNote(amo.lead_id, noteMark(id))) ?? undefined;
      if (!amo.note_id) amo.note_id = await addLeadNote(amo.lead_id, noteText(f, rec));
      settle("note");
    }

    amo.state = "done";
    amo.doneAt = new Date().toISOString();
    delete amo.nextAttemptAt;
    delete amo.lastError;
    await save();
    await markPending(id, false);
    console.log("[amo] заявка доставлена", JSON.stringify({ submission_id: id, contact_id: amo.contact_id, lead_id: amo.lead_id, note_id: amo.note_id, ambiguous_contacts: amo.ambiguous_contacts }));
    if (amo.ambiguous_contacts) console.warn("[amo] несколько контактов с одним телефоном — сделка без контакта", id, amo.ambiguous_contacts.join(","));
  } catch (error) {
    const e = error instanceof AmoError ? error : new AmoError(String((error as Error)?.message ?? error), null, true, false);
    amo.attempts += 1;
    amo.lastError = `${new Date().toISOString()} [${step}] ${e.message}`.slice(0, 2000);
    if (e.uncertain && !amo.uncertain?.includes(step)) amo.uncertain = [...(amo.uncertain ?? []), step];
    if (e.retryable && amo.attempts < MAX_ATTEMPTS) {
      // 2, 4, 8 … 60 минут; при неизвестном исходе — не раньше чем через 2 минуты (поиск amoCRM индексирует не сразу)
      const minutes = Math.min(60, 2 ** Math.min(amo.attempts, 6));
      amo.nextAttemptAt = new Date(Date.now() + minutes * 60_000).toISOString();
      console.warn("[amo] временная ошибка, повтор позже", id, amo.lastError);
    } else {
      amo.state = "failed";
      console.error("[amo] заявка НЕ доставлена, нужен разбор", id, amo.lastError);
    }
    await save().catch((err) => console.error("[amo] журнал: не сохранено", id, err));
    if (amo.state === "failed") await markPending(id, false).catch(() => {});
  }
}

let sweeping = false;
let timer: ReturnType<typeof setInterval> | null = null;

/** Фоновый обход недоставленных заявок (после рестарта/деплоя тоже: метки лежат в S3). */
export function startAmoSweeper() {
  if (timer || !amoEnabled()) return;
  const sweep = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      for (const id of await listPending()) await processLead(id);
    } catch (error) {
      console.error("[amo] обход недоставленных", error);
    } finally {
      sweeping = false;
    }
  };
  timer = setInterval(sweep, SWEEP_MS);
  timer.unref?.();
  setTimeout(sweep, 15_000).unref?.();
}
