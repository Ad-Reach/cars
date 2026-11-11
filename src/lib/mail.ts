import nodemailer, { type Transporter } from "nodemailer";
import { site as localSite } from "@/data/site";

// Дублирование заявок на почту. Адрес получателя — LEAD_EMAIL_TO
// (можно несколько через запятую), по умолчанию email из src/data/site.ts.
// SMTP — переменные окружения приложения в App Platform (задаются в Ad-Reach/infra):
//   SMTP_HOST, SMTP_PORT (по умолчанию 465), SMTP_USER, SMTP_PASS,
//   SMTP_FROM (по умолчанию SMTP_USER). Без SMTP_HOST письма не отправляются.

let transport: Transporter | null = null;

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }
  return transport;
}

function recipient() {
  return process.env.LEAD_EMAIL_TO?.trim() || localSite.email;
}

const htmlToText = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

// html — то же сообщение, что уходит в Telegram (теги <b>, <i>, <a>, переносы строк)
export async function sendLeadEmail(subject: string, html: string) {
  const smtp = getTransport();
  if (!smtp) return false;
  try {
    const to = recipient();
    await smtp.sendMail({
      from: { name: "Сайт rangauto.ru", address: process.env.SMTP_FROM || process.env.SMTP_USER || to },
      to,
      subject,
      text: htmlToText(html),
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${html.replace(/\n/g, "<br>")}</div>`,
    });
    return true;
  } catch (error) {
    console.error("[lead] email", error);
    return false;
  }
}
