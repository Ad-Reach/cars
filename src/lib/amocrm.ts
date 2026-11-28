// Клиент amoCRM API v4 для заявок с сайта.
// Настройки — переменные окружения приложения (задаёт Ad-Reach/infra):
//   AMOCRM_TOKEN    — долгосрочный токен интеграции (секрет; только на сервере)
//   AMOCRM_BASE_URL — адрес аккаунта, по умолчанию https://rangauto123.amocrm.ru
// Без AMOCRM_TOKEN отправка в amoCRM выключена.

const BASE = (process.env.AMOCRM_BASE_URL ?? "https://rangauto123.amocrm.ru").replace(/\/+$/, "");
const token = () => process.env.AMOCRM_TOKEN ?? "";

export const amoEnabled = () => !!token();

// Общий лимит API аккаунта ~7 запросов/с на интеграцию; аккаунтом пользуются и другие системы,
// поэтому заявки с сайта идут не чаще 1 запроса в 350 мс, строго по очереди.
const GAP_MS = 350;
const TIMEOUT_MS = 15000;
let queue: Promise<unknown> = Promise.resolve();
let lastAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ошибка запроса к amoCRM.
 * retryable — временная (429, 5xx, сеть): повторить позже.
 * uncertain — запрос мог дойти, но ответа нет (таймаут/обрыв): перед повтором POST сверить результат.
 */
export class AmoError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly uncertain: boolean,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown>;

async function once(method: string, path: string, body?: unknown): Promise<{ status: number; data: Json | null }> {
  const wait = lastAt + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastAt = Date.now();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // для GET исход не важен; для POST — неизвестно, создалось ли
    throw new AmoError(`${method} ${path}: ${(error as Error).message}`, null, true, method !== "GET");
  }
  const text = await res.text().catch(() => "");
  if (res.status === 204) return { status: 204, data: null };
  if (res.ok) {
    try {
      return { status: res.status, data: JSON.parse(text) };
    } catch {
      throw new AmoError(`${method} ${path}: ответ ${res.status} не JSON`, res.status, true, method !== "GET");
    }
  }
  const retryable = res.status === 429 || res.status >= 500;
  // 5xx на POST: сервер мог успеть создать сущность
  throw new AmoError(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 500)}`, res.status, retryable, retryable && method !== "GET");
}

/** Запрос с очередью и короткими повторами 429 (для GET — и 5xx/сети). */
export function amoRequest(method: "GET" | "POST", path: string, body?: unknown) {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await once(method, path, body);
      } catch (error) {
        const e = error as AmoError;
        // 429 — запрос не принят, повтор безопасен; остальное для POST повторяем только после сверки (leadCrm)
        const safe = e.status === 429 || (method === "GET" && e.retryable);
        if (!safe || attempt >= 2) throw e;
        await sleep(e.status === 429 ? 2000 * (attempt + 1) : 1000 * (attempt + 1));
      }
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

// --- сущности ---

export const phoneDigits = (v: string) => {
  let d = v.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d;
};

type Contact = { id: number; custom_fields_values?: { field_code?: string; values?: { value?: unknown }[] }[] | null };

/** Контакты, у которых телефон полностью совпадает по цифрам (поиск amoCRM нечёткий). */
export async function findContactsByPhone(phone: string): Promise<number[]> {
  const digits = phoneDigits(phone);
  // ищем по 10 последним цифрам: найдутся и записи вида 8 (999)…, и +7 999…
  const { data } = await amoRequest("GET", `/api/v4/contacts?limit=250&query=${encodeURIComponent(digits.slice(-10))}`);
  const contacts = ((data?._embedded as Json | undefined)?.contacts ?? []) as Contact[];
  return contacts
    .filter((c) =>
      (c.custom_fields_values ?? []).some(
        (f) => f.field_code === "PHONE" && (f.values ?? []).some((v) => phoneDigits(String(v.value ?? "")) === digits),
      ),
    )
    .map((c) => c.id);
}

const firstId = (data: Json | null, entity: string) => {
  const id = ((data?._embedded as Json | undefined)?.[entity] as { id?: unknown }[] | undefined)?.[0]?.id;
  return typeof id === "number" && id > 0 ? id : null;
};

function requireId(data: Json | null, entity: string, what: string) {
  const id = firstId(data, entity);
  // HTTP 2xx без ID — не считаем успехом
  if (!id) throw new AmoError(`${what}: в ответе нет _embedded.${entity}[0].id`, null, true, true);
  return id;
}

export async function createContact(name: string, phone: string) {
  const { data } = await amoRequest("POST", "/api/v4/contacts", [
    { name, custom_fields_values: [{ field_code: "PHONE", values: [{ value: phone, enum_code: "WORK" }] }] },
  ]);
  return requireId(data, "contacts", "POST /contacts");
}

export async function createLead(lead: Json) {
  const { data } = await amoRequest("POST", "/api/v4/leads", [lead]);
  return requireId(data, "leads", "POST /leads");
}

type Lead = { id: number; custom_fields_values?: { field_id?: number; values?: { value?: unknown }[] }[] | null };

/** Сделка, у которой в текстовом поле fieldId есть метка (например «submission_id=…»). */
export async function findLeadByMark(fieldId: number, mark: string): Promise<number | null> {
  const { data } = await amoRequest("GET", `/api/v4/leads?limit=50&query=${encodeURIComponent(mark)}`);
  const leads = ((data?._embedded as Json | undefined)?.leads ?? []) as Lead[];
  const hit = leads.find((l) =>
    (l.custom_fields_values ?? []).some((f) => f.field_id === fieldId && (f.values ?? []).some((v) => String(v.value ?? "").includes(mark))),
  );
  return hit?.id ?? null;
}

export async function addLeadNote(leadId: number, text: string) {
  const { data } = await amoRequest("POST", `/api/v4/leads/${leadId}/notes`, [{ note_type: "common", params: { text } }]);
  return requireId(data, "notes", "POST /notes");
}

type Note = { id: number; params?: { text?: string } };

export async function findLeadNote(leadId: number, mark: string): Promise<number | null> {
  const { data } = await amoRequest("GET", `/api/v4/leads/${leadId}/notes?limit=250&filter[note_type]=common`);
  const notes = ((data?._embedded as Json | undefined)?.notes ?? []) as Note[];
  return notes.find((n) => (n.params?.text ?? "").includes(mark))?.id ?? null;
}
