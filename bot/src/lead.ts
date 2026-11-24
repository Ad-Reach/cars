import type { Api } from "grammy";
import { config } from "./config.js";
import { sendLeadEmail } from "./mail.js";
import { priceText, similarUrl, WHEEL_NAME, type Car } from "./catalog.js";
import { escapeHtml as e } from "./texts.js";

// Доставка заявки: в чаты LEAD_CHAT_IDS (с кнопками статуса), на почту (SMTP_*) и/или на сайт (LEAD_API_URL).

export type Lead = {
  /** пусто — клиент просит связаться в Telegram */
  phone: string;
  name: string;
  user: { id: number; username?: string };
  /** ответы клиента: [название, значение] — как они показываются менеджеру */
  rows: [string, string][];
  car?: Car;
  comment?: string;
  source?: "bot" | "miniapp";
};

export const LEAD_STEPS = ["Принята", "Менеджер звонит", "Подбираем авто"];

function format(lead: Lead) {
  const digits = lead.phone.replace(/\D/g, "");
  const tg = lead.user.username ? `@${lead.user.username}` : `<a href="tg://user?id=${lead.user.id}">профиль</a>`;
  const lines = [lead.source === "miniapp" ? "<b>🚗 Заявка из Telegram Mini App</b>" : "<b>🚗 Заявка из Telegram-бота</b>", ""];
  lines.push(`<b>Имя:</b> ${e(lead.name)}`);
  lines.push(lead.phone ? `<b>Телефон:</b> <a href="tel:+${digits}">${e(lead.phone)}</a>` : "<b>Телефон:</b> не указан — просит связаться в Telegram");
  lines.push(`<b>Telegram:</b> ${tg}`);
  for (const [k, v] of lead.rows) lines.push(`<b>${e(k)}:</b> ${e(v)}`);
  if (lead.car) {
    const c = lead.car;
    lines.push(`<b>Машина:</b> <a href="${similarUrl(c)}">${e(c.title)}</a>, ${e(c.year)} — ${priceText(c)} (${WHEEL_NAME[c.wheel]})`);
  }
  if (lead.comment) lines.push(`<b>Пожелания:</b> ${e(lead.comment)}`);
  lines.push("", `<i>${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</i>`);
  return lines.join("\n");
}

const statusKeyboard = (userId: number) => ({
  inline_keyboard: [LEAD_STEPS.slice(1).map((label, i) => ({ text: label, callback_data: `st:${userId}:${i + 1}` }))],
});

async function toSite(lead: Lead) {
  const r = Object.fromEntries(lead.rows);
  const c = lead.car;
  const res = await fetch(config.leadApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: lead.source === "miniapp" ? "telegram-miniapp" : "telegram-bot",
      name: lead.name,
      phone: lead.phone,
      contact: lead.user.username ? `Telegram @${lead.user.username}` : `Telegram id ${lead.user.id}`,
      budget: r["Бюджет"],
      wishes: [c && `${c.title}, ${c.year} — ${priceText(c)}`, r["Руль"] && `Руль: ${r["Руль"]}`, r["Состояние"] && `Состояние: ${r["Состояние"]}`].filter(Boolean).join("; "),
      comment: [r["Город"] && `Город: ${r["Город"]}`, r["Когда нужна машина"] && `Когда: ${r["Когда нужна машина"]}`, lead.comment].filter(Boolean).join("; "),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`lead api ${res.status} ${await res.text()}`);
}

/** true — заявка ушла хотя бы в одно место */
export async function deliverLead(api: Api, lead: Lead) {
  console.log("[lead]", new Date().toISOString(), JSON.stringify(lead));
  const text = format(lead);
  const jobs = [
    ...config.leadChatIds.map((chat) =>
      api.sendMessage(chat, text, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: statusKeyboard(lead.user.id) }),
    ),
    ...(config.leadApiUrl ? [toSite(lead)] : []),
    ...(config.smtp.host ? [sendLeadEmail(`Заявка из Telegram-бота: ${lead.name || lead.phone || "без телефона"}`, text)] : []),
  ];
  if (!jobs.length) console.warn("[lead] не настроены LEAD_CHAT_IDS / SMTP / LEAD_API_URL — заявка только в логе");
  const results = await Promise.allSettled(jobs);
  results.forEach((r) => r.status === "rejected" && console.error("[lead]", r.reason));
  return results.some((r) => r.status === "fulfilled");
}
