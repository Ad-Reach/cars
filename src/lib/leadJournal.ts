import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AwsClient } from "aws4fetch";

// Журнал заявок: каждая заявка сохраняется ДО отправки куда-либо, затем в неё дописываются
// результаты (Telegram, почта, amoCRM: contact_id / lead_id / note_id).
// Повтор той же отправки (тот же submission_id) читает запись и досылает только недоставленное.
// Хранится в S3 Таймвеба (те же CHATS_S3_*, что у списка Telegram-групп — диск App Platform
// сбрасывается при деплое). Без S3 (локальная разработка) — файлы во временной папке.
//   app/leads/<submission_id>.json   — запись
//   app/leads-pending/<submission_id> — метка «в amoCRM ещё не доставлено» (её обходит src/lib/leadCrm.ts)

export type AmoStep = "contact" | "lead" | "note";

export type LeadRecord = {
  id: string;
  receivedAt: string;
  ip: string;
  /** данные формы как пришли (без поля-ловушки) */
  payload: Record<string, unknown>;
  telegram?: boolean;
  email?: boolean;
  amo?: {
    state: "pending" | "done" | "failed" | "skipped";
    contact_id?: number;
    /** несколько контактов с этим телефоном — сделка создана без привязки, разобрать вручную */
    ambiguous_contacts?: number[];
    lead_id?: number;
    note_id?: number;
    /** POST ушёл, но ответа нет (таймаут/обрыв): перед повтором сверяемся с amoCRM */
    uncertain?: AmoStep[];
    attempts: number;
    nextAttemptAt?: string;
    lastError?: string;
    doneAt?: string;
  };
};

const bucket = process.env.CHATS_S3_BUCKET;
const endpoint = process.env.CHATS_S3_ENDPOINT ?? "https://s3.twcstorage.ru";
const PREFIX = process.env.LEADS_S3_PREFIX ?? "app/leads";
const PENDING = `${PREFIX}-pending`;

const s3 =
  bucket && process.env.CHATS_S3_ACCESS_KEY && process.env.CHATS_S3_SECRET_KEY
    ? new AwsClient({
        accessKeyId: process.env.CHATS_S3_ACCESS_KEY,
        secretAccessKey: process.env.CHATS_S3_SECRET_KEY,
        service: "s3",
        region: process.env.CHATS_S3_REGION ?? "ru-1",
      })
    : null;

const localDir = () => process.env.LEADS_DIR ?? path.join(os.tmpdir(), "rangauto-leads");
const objectUrl = (key: string) => `${endpoint}/${bucket}/${key}`;

export const isSubmissionId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v);

async function s3Call(key: string, init: RequestInit = {}) {
  return s3!.fetch(objectUrl(key), { ...init, signal: AbortSignal.timeout(8000) });
}

export async function readLead(id: string): Promise<LeadRecord | null> {
  if (s3) {
    const res = await s3Call(`${PREFIX}/${id}.json`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 GET ${res.status}`);
    return JSON.parse(await res.text());
  }
  try {
    return JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ path.join(localDir(), "leads", `${id}.json`), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeLead(record: LeadRecord) {
  const body = JSON.stringify(record, null, 2);
  if (s3) {
    const res = await s3Call(`${PREFIX}/${record.id}.json`, {
      method: "PUT",
      body,
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`S3 PUT ${res.status}`);
    return;
  }
  const dir = path.join(localDir(), "leads");
  await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  const file = path.join(dir, `${record.id}.json`);
  await fs.writeFile(/*turbopackIgnore: true*/ `${file}.tmp`, body);
  await fs.rename(/*turbopackIgnore: true*/ `${file}.tmp`, file);
}

export async function markPending(id: string, pending: boolean) {
  if (s3) {
    const res = await s3Call(`${PENDING}/${id}`, pending ? { method: "PUT", body: "" } : { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`S3 ${pending ? "PUT" : "DELETE"} ${res.status}`);
    return;
  }
  const dir = path.join(localDir(), "pending");
  await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  if (pending) await fs.writeFile(/*turbopackIgnore: true*/ path.join(dir, id), "");
  else await fs.rm(/*turbopackIgnore: true*/ path.join(dir, id), { force: true });
}

export async function listPending(): Promise<string[]> {
  if (s3) {
    const ids: string[] = [];
    let token = "";
    do {
      const q = new URLSearchParams({ "list-type": "2", prefix: `${PENDING}/`, "max-keys": "1000" });
      if (token) q.set("continuation-token", token);
      const res = await s3!.fetch(`${endpoint}/${bucket}?${q}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`S3 LIST ${res.status}`);
      const xml = await res.text();
      for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
        const id = m[1].slice(PENDING.length + 1);
        if (isSubmissionId(id)) ids.push(id);
      }
      token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? "";
    } while (token);
    return ids;
  }
  try {
    return (await fs.readdir(/*turbopackIgnore: true*/ path.join(localDir(), "pending"))).filter(isSubmissionId);
  } catch {
    return [];
  }
}
