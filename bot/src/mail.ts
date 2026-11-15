import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config.js";
import { brand } from "./brand.js";

// Дублирование заявок на почту — как у сайта (src/lib/mail.ts в корне репозитория).
// SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, SMTP_FROM, LEAD_EMAIL_TO задаёт Ad-Reach/infra.
// Без SMTP_HOST письма не отправляются.

let transport: Transporter | null = null;

function getTransport() {
  if (!config.smtp.host) return null;
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
  return transport;
}

const htmlToText = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** html — то же сообщение, что уходит менеджерам в Telegram */
export async function sendLeadEmail(subject: string, html: string) {
  const smtp = getTransport();
  if (!smtp || !config.leadEmailTo) return false;
  await smtp.sendMail({
    from: { name: `Telegram-бот ${brand.name}`, address: config.smtp.from || config.smtp.user || config.leadEmailTo },
    to: config.leadEmailTo,
    subject,
    text: htmlToText(html),
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${html.replace(/\n/g, "<br>")}</div>`,
  });
  return true;
}
