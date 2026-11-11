import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AwsClient } from "aws4fetch";

// Список Telegram-групп, куда бот шлёт заявки.
// В App Platform диск сбрасывается при каждом деплое, поэтому список хранится в S3 Таймвеба
// (CHATS_S3_* задаёт Ad-Reach/infra). Без S3 (локальная разработка) — файл во временной папке.

export type StoredChat = { id: number; title: string; addedBy: number; addedAt: string };

const bucket = process.env.CHATS_S3_BUCKET;
const key = process.env.CHATS_S3_KEY ?? "app/telegram-chats.json";
const endpoint = process.env.CHATS_S3_ENDPOINT ?? "https://s3.twcstorage.ru";

const s3 =
  bucket && process.env.CHATS_S3_ACCESS_KEY && process.env.CHATS_S3_SECRET_KEY
    ? new AwsClient({
        accessKeyId: process.env.CHATS_S3_ACCESS_KEY,
        secretAccessKey: process.env.CHATS_S3_SECRET_KEY,
        service: "s3",
        region: process.env.CHATS_S3_REGION ?? "ru-1",
      })
    : null;

const objectUrl = () => `${endpoint}/${bucket}/${key}`;
const localFile = () => process.env.TELEGRAM_CHATS_FILE ?? path.join(os.tmpdir(), "telegram-chats.json");

export async function readChats(): Promise<StoredChat[]> {
  try {
    if (s3) {
      const res = await s3.fetch(objectUrl(), { signal: AbortSignal.timeout(8000) });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`S3 GET ${res.status}`);
      return JSON.parse(await res.text());
    }
    return JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ localFile(), "utf8"));
  } catch (error) {
    if (s3) console.error("[telegram] чтение списка групп", error);
    return [];
  }
}

export async function writeChats(chats: StoredChat[]) {
  const body = JSON.stringify(chats, null, 2);
  if (s3) {
    const res = await s3.fetch(objectUrl(), {
      method: "PUT",
      body,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`S3 PUT ${res.status}`);
    return;
  }
  const file = localFile();
  await fs.writeFile(/*turbopackIgnore: true*/ `${file}.tmp`, body);
  await fs.rename(/*turbopackIgnore: true*/ `${file}.tmp`, file);
}
