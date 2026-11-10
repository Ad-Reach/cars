import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

// Передача заявок в amoCRM: контакт → новая сделка на первом этапе → примечание с полным текстом.
// Переменные окружения сервера (/etc/rangauto.env):
//   AMOCRM_TOKEN     — долгосрочный токен интеграции (без него заявки в amoCRM не уходят)
//   AMOCRM_BASE_URL  — по умолчанию https://rangauto123.amocrm.ru
//   LEADS_DIR        — журнал заявок, по умолчанию /srv/rangauto/leads
//
// Каждая заявка сохраняется в журнал до отправки: <LEADS_DIR>/<submission_id>.json.
// В нём же — ID созданных контакта, сделки и примечания. Повтор той же заявки не создаёт
// новую сделку: выполняются только недоставленные шаги. Если исход запроса неизвестен
// (таймаут, обрыв), перед повтором ищем уже созданное по submission_id.

const BASE = (process.env.AMOCRM_BASE_URL || "https://rangauto123.amocrm.ru").replace(/\/$/, "");
const DIR = process.env.LEADS_DIR || "/srv/rangauto/leads";
const token = () => process.env.AMOCRM_TOKEN ?? "";

const PIPELINE_ID = 11385330; // «Продажа авто»
const STATUS_ID = 89205286; // «Новая заявка — ведёт ИИ»
const F = {
  channel: 1825294, // Канал поступления (список)
  channelSite: 1196442, //   → «Сайт rangauto.ru»
  channelBasis: 1825296, // Основание канала
  brand: 1477031,
  model: 1477033,
  budget: 1477037, // число
  city: 1477041,
  wishes: 1477043,
  lotUrl: 1477073,
};

export type LeadInput = {
  submissionId: string;
  source: string; // rangauto.ru
  form: string; // человеческое название формы
  pageUrl: string;
  name: string;
  phone: string; // +7XXXXXXXXXX
  contactMethod: string;
  city: string;
  budget: string;
  wishes: string;
  brand: string;
  model: string;
  vehicleName: string;
  vehicleUrl: string;
  utm: Record<string, string>;
  fields: Record<string, string>; // все ответы формы
};

type Step = "contact" | "lead" | "note";

type Journal = {
  input: LeadInput;
  createdAt: string;
  contactId?: number;
  ambiguousContacts?: number[]; // несколько контактов с этим телефоном — разобрать вручную
  leadId?: number;
  noteId?: number;
  inFlight?: Step; // шаг, исход которого неизвестен
  done?: boolean;
  failed?: string; // ошибка 400/401/403 — повторять бессмысленно, нужен разбор
  attempts: number;
  lastError?: string;
};

export const isValidSubmissionId = (id: string) => /^[A-Za-z0-9-]{8,64}$/.test(id);
const file = (id: string) => path.join(DIR, `${id}.json`);

async function save(j: Journal) {
  await mkdir(DIR, { recursive: true });
  const target = file(j.input.submissionId);
  await writeFile(`${target}.tmp`, JSON.stringify(j, null, 2));
  await rename(`${target}.tmp`, target);
}

async function load(id: string): Promise<Journal | null> {
  try {
    return JSON.parse(await readFile(file(id), "utf8")) as Journal;
  } catch {
    return null;
  }
}

// ── HTTP с троттлингом ────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 500)}`);
  }
}
// Исход неизвестен: запрос мог дойти до amoCRM
class UnknownOutcome extends Error {}

const MIN_GAP = 250; // не больше 4 запросов в секунду — лимит аккаунта общий с другими системами
let chain = Promise.resolve();
function throttle() {
  const slot = chain.then(() => new Promise<void>((r) => setTimeout(r, MIN_GAP)));
  chain = slot;
  return chain;
}

async function api<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T | null> {
  await throttle();
  let res: Response;
  try {
    res = await fetch(`${BASE}${url}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (method === "POST") throw new UnknownOutcome(String(error));
    throw error;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) {
    // 5xx на POST — тоже неизвестно, создалось ли
    if (method === "POST" && res.status >= 500) throw new UnknownOutcome(`HTTP ${res.status}`);
    throw new HttpError(res.status, text);
  }
  return text ? (JSON.parse(text) as T) : null;
}

// ── Шаги ──────────────────────────────────────────────────────────────────

type CF = { field_id?: number; field_code?: string; values?: { value?: unknown }[] };
type Contact = { id: number; custom_fields_values?: CF[] | null };
type Lead = { id: number; custom_fields_values?: CF[] | null };

const digits = (s: unknown) => {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("8") ? `7${d.slice(1)}` : d;
};

async function findContacts(phone: string) {
  const res = await api<{ _embedded?: { contacts?: Contact[] } }>(
    "GET",
    `/api/v4/contacts?limit=50&query=${encodeURIComponent(digits(phone).slice(1))}`,
  );
  const want = digits(phone);
  return (res?._embedded?.contacts ?? []).filter((c) =>
    (c.custom_fields_values ?? []).some(
      (f) => f.field_code === "PHONE" && (f.values ?? []).some((v) => digits(v.value) === want),
    ),
  );
}

async function createContact(input: LeadInput) {
  const res = await api<{ _embedded: { contacts: { id: number }[] } }>("POST", "/api/v4/contacts", [
    {
      name: input.name || input.phone,
      custom_fields_values: [{ field_code: "PHONE", values: [{ value: input.phone, enum_code: "WORK" }] }],
    },
  ]);
  const id = res?._embedded?.contacts?.[0]?.id;
  if (!id) throw new Error("amoCRM не вернул ID контакта");
  return id;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function basis(input: LeadInput) {
  return cut(`Форма ${input.source} — ${input.form}; submission_id=${input.submissionId}; ${input.pageUrl}`, 250);
}

// Бюджет числом — только если это одно число без диапазона («3 000 000», «3000000 ₽»)
function budgetNumber(raw: string) {
  const s = raw.replace(/[\s ₽руб.]/gi, "");
  return /^\d{4,10}$/.test(s) ? Number(s) : null;
}

function leadFields(input: LeadInput) {
  const out: object[] = [
    { field_id: F.channel, values: [{ enum_id: F.channelSite }] },
    { field_id: F.channelBasis, values: [{ value: basis(input) }] },
  ];
  const text = (id: number, v: string, max = 250) => v && out.push({ field_id: id, values: [{ value: cut(v, max) }] });
  text(F.brand, input.brand);
  text(F.model, input.model);
  text(F.city, input.city);
  text(F.wishes, input.wishes, 10_000);
  if (/^https?:\/\//.test(input.vehicleUrl)) text(F.lotUrl, input.vehicleUrl, 2000);
  const budget = budgetNumber(input.budget);
  if (budget) out.push({ field_id: F.budget, values: [{ value: budget }] });
  return out;
}

async function createLead(input: LeadInput, contactId?: number) {
  const res = await api<{ _embedded: { leads: { id: number }[] } }>("POST", "/api/v4/leads", [
    {
      name: cut(`Заявка ${input.source} — ${input.name || input.phone}`, 250),
      pipeline_id: PIPELINE_ID,
      status_id: STATUS_ID,
      custom_fields_values: leadFields(input),
      ...(contactId ? { _embedded: { contacts: [{ id: contactId, is_main: true }] } } : {}),
    },
  ]);
  const id = res?._embedded?.leads?.[0]?.id;
  if (!id) throw new Error("amoCRM не вернул ID сделки");
  return id;
}

const hasSubmission = (lead: Lead, sid: string) =>
  (lead.custom_fields_values ?? []).some(
    (f) => f.field_id === F.channelBasis && (f.values ?? []).some((v) => String(v.value ?? "").includes(sid)),
  );

// Сделка по этой заявке уже есть? Ищем по submission_id в «Основании канала»
async function findLead(j: Journal) {
  const sid = j.input.submissionId;
  const found = await api<{ _embedded?: { leads?: Lead[] } }>(
    "GET",
    `/api/v4/leads?limit=50&query=${encodeURIComponent(sid)}`,
  );
  const hit = (found?._embedded?.leads ?? []).find((l) => hasSubmission(l, sid));
  if (hit) return hit.id;
  // поиск индексирует не сразу — проверяем и сделки контакта
  if (!j.contactId) return null;
  const contact = await api<{ _embedded?: { leads?: { id: number }[] } }>(
    "GET",
    `/api/v4/contacts/${j.contactId}?with=leads`,
  );
  const ids = (contact?._embedded?.leads ?? []).map((l) => l.id).slice(-50);
  if (!ids.length) return null;
  const leads = await api<{ _embedded?: { leads?: Lead[] } }>(
    "GET",
    `/api/v4/leads?${ids.map((id, i) => `filter[id][${i}]=${id}`).join("&")}`,
  );
  return (leads?._embedded?.leads ?? []).find((l) => hasSubmission(l, sid))?.id ?? null;
}

function noteText(j: Journal) {
  const i = j.input;
  const lines = [
    `ID заявки: ${i.submissionId}`,
    `Источник: ${i.source}`,
    `Форма: ${i.form}`,
    `Страница: ${i.pageUrl || "—"}`,
    `Автомобиль: ${i.vehicleName || "—"}`,
    `Ссылка на автомобиль: ${i.vehicleUrl || "—"}`,
    `Имя: ${i.name || "—"}`,
    `Телефон: ${i.phone}`,
    `Способ связи: ${i.contactMethod || "—"}`,
    `Город: ${i.city || "—"}`,
    `Бюджет: ${i.budget || "—"}`,
    `Пожелания: ${i.wishes || "—"}`,
    `UTM: ${Object.keys(i.utm).length ? JSON.stringify(i.utm) : "—"}`,
    `Все поля формы: ${JSON.stringify(i.fields)}`,
  ];
  if (j.ambiguousContacts?.length) {
    lines.push("", `⚠ С этим телефоном несколько контактов (${j.ambiguousContacts.join(", ")}) — привяжите нужный вручную.`);
  }
  return lines.join("\n");
}

async function findNote(j: Journal) {
  const res = await api<{ _embedded?: { notes?: { id: number; params?: { text?: string } }[] } }>(
    "GET",
    `/api/v4/leads/${j.leadId}/notes?limit=50`,
  );
  const marker = `ID заявки: ${j.input.submissionId}`;
  return (res?._embedded?.notes ?? []).find((n) => n.params?.text?.startsWith(marker))?.id ?? null;
}

async function createNote(j: Journal) {
  const res = await api<{ _embedded: { notes: { id: number }[] } }>("POST", `/api/v4/leads/${j.leadId}/notes`, [
    { note_type: "common", params: { text: noteText(j) } },
  ]);
  const id = res?._embedded?.notes?.[0]?.id;
  if (!id) throw new Error("amoCRM не вернул ID примечания");
  return id;
}

// Выполняет недоставленные шаги; каждый результат сразу пишется в журнал
async function deliver(j: Journal) {
  // контакт: поиск идемпотентен, поэтому и при неизвестном исходе просто ищем ещё раз
  if (!j.contactId && !j.ambiguousContacts) {
    const found = await findContacts(j.input.phone);
    if (found.length === 1) j.contactId = found[0].id;
    else if (found.length > 1) j.ambiguousContacts = found.map((c) => c.id);
    else {
      j.inFlight = "contact";
      await save(j);
      j.contactId = await createContact(j.input);
    }
    j.inFlight = undefined;
    await save(j);
  }

  if (!j.leadId) {
    if (j.inFlight === "lead") j.leadId = (await findLead(j)) ?? undefined;
    if (!j.leadId) {
      j.inFlight = "lead";
      await save(j);
      j.leadId = await createLead(j.input, j.contactId);
    }
    j.inFlight = undefined;
    await save(j);
  }

  if (!j.noteId) {
    if (j.inFlight === "note") j.noteId = (await findNote(j)) ?? undefined;
    if (!j.noteId) {
      j.inFlight = "note";
      await save(j);
      j.noteId = await createNote(j);
    }
    j.inFlight = undefined;
  }

  j.done = true;
  await save(j);
  console.log(`[amocrm] ${j.input.submissionId}: контакт ${j.contactId ?? "—"}, сделка ${j.leadId}, примечание ${j.noteId}`);
}

// ── Очередь с повторами ───────────────────────────────────────────────────

const RETRY_DELAYS = [5, 20, 60, 180, 600, 1800, 3600].map((s) => s * 1000);
const running = new Set<string>();

async function run(id: string) {
  if (running.has(id) || !token()) return;
  running.add(id);
  let retryIn: number | null = null;
  try {
    const j = await load(id);
    if (!j || j.done || j.failed) return;
    j.attempts += 1;
    try {
      await deliver(j);
    } catch (error) {
      j.lastError = String(error instanceof Error ? error.message : error);
      const permanent = error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 429;
      if (permanent) {
        j.failed = j.lastError;
        console.error(`[amocrm] ${id}: ошибка, нужна ручная проверка — ${j.lastError}`);
      } else {
        retryIn = RETRY_DELAYS[Math.min(j.attempts - 1, RETRY_DELAYS.length - 1)];
        // неизвестный исход — даём поиску amoCRM время проиндексировать созданное
        if (error instanceof UnknownOutcome) retryIn = Math.max(retryIn, 30_000);
        console.warn(`[amocrm] ${id}: попытка ${j.attempts} не удалась, повтор через ${retryIn / 1000} с — ${j.lastError}`);
      }
      await save(j);
    }
  } catch (error) {
    console.error(`[amocrm] ${id}: журнал недоступен`, error);
  } finally {
    running.delete(id);
  }
  if (retryIn !== null) setTimeout(() => void run(id), retryIn).unref?.();
}

/**
 * Сохраняет заявку в журнал и запускает отправку в amoCRM (в фоне).
 * Возвращает false, если заявка с этим submission_id уже была — повтор той же отправки.
 */
export async function enqueueLead(input: LeadInput): Promise<boolean> {
  const existing = await load(input.submissionId);
  if (existing) {
    void run(input.submissionId); // вдруг прошлая попытка не дошла
    return false;
  }
  try {
    await save({ input, createdAt: new Date().toISOString(), attempts: 0 });
  } catch (error) {
    console.error("[amocrm] не удалось сохранить заявку в журнал", error);
    return true;
  }
  void run(input.submissionId);
  return true;
}

// При старте сервера дожимаем недоставленные заявки
export async function resumePending() {
  if (!token()) return;
  let names: string[] = [];
  try {
    names = await readdir(DIR);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    const j = await load(id);
    if (j && !j.done && !j.failed) void run(id);
  }
}
