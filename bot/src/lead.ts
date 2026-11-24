import type { Api } from "grammy";
import { config } from "./config.js";
import { sendLeadEmail } from "./mail.js";
import { describe } from "./quiz.js";
import { priceText, similarUrl, WHEEL_NAME } from "./catalog.js";
import type { Session } from "./session.js";
import { escapeHtml as e } from "./texts.js";

// Доставка заявки: в чаты LEAD_CHAT_IDS (с кнопками статуса), на почту (SMTP_*) и/или на сайт (LEAD_API_URL).

export type Lead = {
  phone: string;
  name: string;
  user: { id: number; username?: string };
  session: Session;
  source?: "bot" | "miniapp";
};

export const LEAD_STEPS = ["Принята", "Менеджер звонит", "Подбираем авто"];

function format(lead: Lead) {
  const { session: s } = lead;
  const digits = lead.phone.replace(/\D/g, "");
  const tg = lead.user.username ? `@${lead.user.username}` : `<a href="tg://user?id=${lead.user.id}">профиль</a>`;
  const lines = [lead.source === "miniapp" ? "<b>🚗 Заявка из Telegram Mini App</b>" : "<b>🚗 Заявка из Telegram-бота</b>", ""];
  lines.push(`<b>Имя:</b> ${e(lead.name)}`);
  lines.push(`<b>Телефон:</b> <a href="tel:+${digits}">${e(lead.phone)}</a>`);
  lines.push(`<b>Telegram:</b> ${tg}`);
  for (const [k, v] of describe(s.answers)) lines.push(`<b>${k}:</b> ${e(v)}`);
  if (s.car) lines.push(`<b>Машина:</b> <a href="${similarUrl(s.car)}">${e(s.car.title)}</a>, ${e(s.car.year)} — ${priceText(s.car)} (${WHEEL_NAME[s.car.wheel]})`);
  if (s.comment) lines.push(`<b>Пожелания:</b> ${e(s.comment)}`);
  lines.push("", `<i>${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</i>`);
  return lines.join("\n");
}

const statusKeyboard = (userId: number) => ({
  inline_keyboard: [LEAD_STEPS.slice(1).map((label, i) => ({ text: label, callback_data: `st:${userId}:${i + 1}` }))],
});

async function toSite(lead: Lead) {
  const { session: s } = lead;
  const answers = Object.fromEntries(describe(s.answers));
  const res = await fetch(config.leadApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: lead.source === "miniapp" ? "telegram-miniapp" : "telegram-bot",
      name: lead.name,
      phone: lead.phone,
      contact: lead.user.username ? `Telegram @${lead.user.username}` : `Telegram id ${lead.user.id}`,
      budget: answers["Бюджет"],
      wishes: [s.car && `${s.car.title}, ${s.car.year} — ${priceText(s.car)}`, answers["Руль"] && `Руль: ${answers["Руль"]}`].filter(Boolean).join("; "),
      comment: [answers["Когда нужна машина"] && `Когда: ${answers["Когда нужна машина"]}`, s.comment].filter(Boolean).join("; "),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`lead api ${res.status} ${await res.text()}`);
}

/** true — заявка ушла хотя бы в одно место */
export async function deliverLead(api: Api, lead: Lead) {
  console.log("[lead]", new Date().toISOString(), JSON.stringify({ ...lead, session: { ...lead.session, shown: undefined } }));
  const text = format(lead);
  const jobs = [
    ...config.leadChatIds.map((chat) =>
      api.sendMessage(chat, text, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: statusKeyboard(lead.user.id) }),
    ),
    ...(config.leadApiUrl ? [toSite(lead)] : []),
    ...(config.smtp.host ? [sendLeadEmail(`Заявка из Telegram-бота: ${lead.name || lead.phone}`, text)] : []),
  ];
  if (!jobs.length) console.warn("[lead] не настроены LEAD_CHAT_IDS / SMTP / LEAD_API_URL — заявка только в логе");
  const results = await Promise.allSettled(jobs);
  results.forEach((r) => r.status === "rejected" && console.error("[lead]", r.reason));
  return results.some((r) => r.status === "fulfilled");
}
