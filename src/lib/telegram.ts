import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type Chat = { id: number; type: string; title?: string; username?: string; first_name?: string };
type StoredChat = { id: number; title: string; addedBy: number; addedAt: string };

const API = process.env.TELEGRAM_API_URL ?? "https://api.telegram.org";

const token = () => process.env.TELEGRAM_BOT_TOKEN ?? "";

const ids = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// В App Platform диск приложения сбрасывается при каждом деплое: группы, подключённые
// через бота, живут до следующего деплоя. Постоянный список — TELEGRAM_CHAT_IDS.
const storeFile = () => process.env.TELEGRAM_CHATS_FILE ?? path.join(os.tmpdir(), "telegram-chats.json");

export const webhookSecret = () => createHash("sha256").update(`webhook:${token()}`).digest("hex").slice(0, 48);

function admins() {
  const list = [...ids(process.env.TELEGRAM_ADMIN_IDS), ...ids(process.env.TELEGRAM_CHAT_IDS).filter((id) => !id.startsWith("-"))];
  return new Set(list.map(Number));
}

async function readStore(): Promise<StoredChat[]> {
  try {
    return JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ storeFile(), "utf8"));
  } catch {
    return [];
  }
}

async function writeStore(chats: StoredChat[]) {
  const file = storeFile();
  await fs.writeFile(/*turbopackIgnore: true*/ `${file}.tmp`, JSON.stringify(chats, null, 2));
  await fs.rename(/*turbopackIgnore: true*/ `${file}.tmp`, file);
}

async function addChat(chat: Chat, addedBy: number) {
  const chats = (await readStore()).filter((c) => c.id !== chat.id);
  chats.push({ id: chat.id, title: chat.title ?? chat.username ?? String(chat.id), addedBy, addedAt: new Date().toISOString() });
  await writeStore(chats);
}

async function removeChat(id: number) {
  const chats = await readStore();
  const rest = chats.filter((c) => c.id !== id);
  if (rest.length !== chats.length) await writeStore(rest);
}

async function replaceChat(from: number, to: number) {
  const chats = await readStore();
  const found = chats.find((c) => c.id === from);
  if (!found) return;
  found.id = to;
  await writeStore(chats);
}

async function call(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

const say = (chat_id: number, text: string) => call("sendMessage", { chat_id, text, parse_mode: "HTML" }).catch(() => {});

export async function sendToAll(text: string) {
  if (!token()) return false;
  const stored = await readStore();
  const recipients = [...new Set([...ids(process.env.TELEGRAM_CHAT_IDS), ...stored.map((c) => String(c.id))])];
  if (!recipients.length) return false;

  const results = await Promise.allSettled(
    recipients.map(async (chat_id) => {
      const r = await call("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true });
      if (r.ok) return;
      const migrated = r.json?.parameters?.migrate_to_chat_id;
      if (migrated) {
        await replaceChat(Number(chat_id), migrated);
        const retry = await call("sendMessage", { chat_id: migrated, text, parse_mode: "HTML", disable_web_page_preview: true });
        if (retry.ok) return;
      }
      if (r.status === 403) await removeChat(Number(chat_id));
      throw new Error(`${r.status} ${JSON.stringify(r.json)}`);
    }),
  );
  results.forEach((r, i) => r.status === "rejected" && console.error("[lead] telegram", recipients[i], r.reason));
  return results.some((r) => r.status === "fulfilled");
}

const CONNECTED = (chatId: number) =>
  `✅ Группа подключена: сюда будут приходить заявки с сайта rangauto.ru.\n\n` +
  `Чтобы подключение сохранилось после обновлений сайта, добавьте ID группы <code>${chatId}</code> в TELEGRAM_CHAT_IDS (репозиторий Ad-Reach/infra).`;
const NOT_ADMIN = (userId: number) =>
  `Подключать группы к заявкам может только администратор. Ваш Telegram ID: <code>${userId}</code> — попросите добавить его в список администраторов бота.`;

type Update = {
  my_chat_member?: { chat: Chat; from: { id: number }; new_chat_member: { status: string } };
  message?: { chat: Chat; from?: { id: number }; text?: string; migrate_to_chat_id?: number };
};

export async function handleUpdate(update: Update) {
  const member = update.my_chat_member;
  if (member && member.chat.type !== "private") {
    const { chat, from } = member;
    const status = member.new_chat_member.status;
    if (status === "left" || status === "kicked") {
      await removeChat(chat.id);
    } else if (status === "member" || status === "administrator") {
      if (admins().has(from.id)) {
        await addChat(chat, from.id);
        await say(chat.id, CONNECTED(chat.id));
      } else {
        await say(chat.id, `${NOT_ADMIN(from.id)}\nПосле этого администратор может отправить здесь /connect.`);
      }
    }
    return;
  }

  const message = update.message;
  if (!message) return;
  if (message.migrate_to_chat_id) {
    await replaceChat(message.chat.id, message.migrate_to_chat_id);
    return;
  }
  const command = message.text?.trim().split(/[\s@]/)[0].toLowerCase();
  const userId = message.from?.id ?? 0;
  const chat = message.chat;

  if (command === "/start" && chat.type === "private") {
    await say(chat.id, admins().has(userId)
      ? "Вы администратор бота заявок. Добавьте бота в группу — она подключится автоматически."
      : NOT_ADMIN(userId));
    return;
  }
  if (chat.type === "private") return;

  if (command === "/connect") {
    if (!admins().has(userId)) return say(chat.id, NOT_ADMIN(userId));
    await addChat(chat, userId);
    await say(chat.id, CONNECTED(chat.id));
  } else if (command === "/disconnect") {
    if (!admins().has(userId)) return say(chat.id, NOT_ADMIN(userId));
    await removeChat(chat.id);
    await say(chat.id, "Группа отключена: заявки сюда больше не приходят.");
  }
}

export async function registerWebhook() {
  const url = process.env.TELEGRAM_WEBHOOK_URL ?? "https://rangauto.ru/api/telegram";
  if (!token()) return;
  try {
    const r = await call("setWebhook", {
      url,
      secret_token: webhookSecret(),
      allowed_updates: ["message", "my_chat_member"],
    });
    if (!r.ok) console.error("[telegram] setWebhook", r.status, JSON.stringify(r.json));
  } catch (error) {
    console.error("[telegram] setWebhook", error);
  }
}
