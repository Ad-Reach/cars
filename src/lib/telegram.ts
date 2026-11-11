import { createHash } from "node:crypto";
import { socksDispatcher } from "fetch-socks";
import { ProxyAgent, fetch as proxyFetch, type Dispatcher } from "undici";
import { readChats, writeChats } from "@/lib/chatStore";

// Бот заявок: заявки приходят во все группы, куда добавлен бот.
// Группа подключается сама, когда бота в неё добавляют (или по команде /connect),
// и отключается, когда бота удаляют (или по /disconnect). Список групп — в S3 (src/lib/chatStore.ts).
// TELEGRAM_CHAT_IDS (необязательно) — чаты, куда слать всегда, через запятую.
// TELEGRAM_PROXY (необязательно) — прокси до api.telegram.org: http(s)://user:pass@host:port
// или socks5://user:pass@host:port. Нужен в российском регионе, где Telegram API недоступен.

type Chat = { id: number; type: string; title?: string; username?: string; first_name?: string };

const API = process.env.TELEGRAM_API_URL ?? "https://api.telegram.org";

const token = () => process.env.TELEGRAM_BOT_TOKEN ?? "";

const ids = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const webhookSecret = () => createHash("sha256").update(`webhook:${token()}`).digest("hex").slice(0, 48);

async function addChat(chat: Chat, addedBy: number) {
  const chats = await readChats();
  if (chats.some((c) => c.id === chat.id)) return false;
  chats.push({ id: chat.id, title: chat.title ?? chat.username ?? String(chat.id), addedBy, addedAt: new Date().toISOString() });
  await writeChats(chats);
  console.log("[telegram] группа подключена", chat.id, chat.title ?? "");
  return true;
}

async function removeChat(id: number) {
  const chats = await readChats();
  const rest = chats.filter((c) => c.id !== id);
  if (rest.length === chats.length) return;
  await writeChats(rest);
  console.log("[telegram] группа отключена", id);
}

async function replaceChat(from: number, to: number) {
  const chats = await readChats();
  const found = chats.find((c) => c.id === from);
  if (!found) return;
  found.id = to;
  await writeChats(chats);
}

function makeDispatcher(): Dispatcher | undefined {
  const proxy = process.env.TELEGRAM_PROXY?.trim();
  if (!proxy) return undefined;
  const url = new URL(proxy);
  if (url.protocol.startsWith("socks")) {
    return socksDispatcher({
      type: url.protocol === "socks4:" ? 4 : 5,
      host: url.hostname,
      port: Number(url.port) || 1080,
      userId: decodeURIComponent(url.username) || undefined,
      password: decodeURIComponent(url.password) || undefined,
    });
  }
  return new ProxyAgent(proxy);
}

const dispatcher = makeDispatcher();

async function call(method: string, body: Record<string, unknown>) {
  const res = await proxyFetch(`${API}/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
    dispatcher,
  });
  const json = (await res.json().catch(() => ({}))) as { parameters?: { migrate_to_chat_id?: number } };
  return { ok: res.ok, status: res.status, json };
}

const say = (chat_id: number, text: string) => call("sendMessage", { chat_id, text, parse_mode: "HTML" }).catch(() => {});

export async function sendToAll(text: string) {
  if (!token()) return false;
  const stored = await readChats();
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

const CONNECTED = "✅ Группа подключена: сюда будут приходить заявки с сайта rangauto.ru.";

type Update = {
  my_chat_member?: { chat: Chat; from: { id: number }; new_chat_member: { status: string } };
  message?: { chat: Chat; from?: { id: number }; text?: string; migrate_to_chat_id?: number };
};

const isGroup = (chat: Chat) => chat.type === "group" || chat.type === "supergroup";

export async function handleUpdate(update: Update) {
  const member = update.my_chat_member;
  if (member && isGroup(member.chat)) {
    const { chat, from } = member;
    const status = member.new_chat_member.status;
    if (status === "left" || status === "kicked") {
      await removeChat(chat.id);
    } else if (status === "member" || status === "administrator") {
      if (await addChat(chat, from.id)) await say(chat.id, CONNECTED);
    }
    return;
  }

  const message = update.message;
  if (!message) return;
  const chat = message.chat;
  if (message.migrate_to_chat_id) {
    await replaceChat(chat.id, message.migrate_to_chat_id);
    return;
  }
  const command = message.text?.trim().split(/[\s@]/)[0].toLowerCase();

  if (chat.type === "private") {
    if (command === "/start") await say(chat.id, "Это бот заявок сайта rangauto.ru. Добавьте его в группу — заявки начнут приходить туда.");
    return;
  }
  if (!isGroup(chat)) return;

  if (command === "/disconnect") {
    await removeChat(chat.id);
    await say(chat.id, "Группа отключена: заявки сюда больше не приходят. Чтобы вернуть — /connect.");
    return;
  }
  // Любое сообщение, которое видит бот (в т.ч. /connect), подключает группу, если её ещё нет в списке
  const added = await addChat(chat, message.from?.id ?? 0);
  if (command === "/connect") await say(chat.id, added ? CONNECTED : "Группа уже подключена: заявки приходят сюда.");
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
