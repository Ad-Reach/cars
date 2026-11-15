import type { Api } from "grammy";

// Bot API 10.4 «виджеты»: HTML-приложение прямо в сообщении (https://core.telegram.org/bots/widgets).
// grammY 1.46 ещё не знает этих методов — вызываем их через api.raw (он пропускает любые методы).
// Ограничения: только личные чаты; html ≤ 32 КБ и ≤ 4 КБ после сжатия; без полей ввода и без сети;
// запрос виджета к боту ≤ 64 байт, ответ ≤ 1024 байт, отвечать за 15 секунд.

export type WidgetQuery = {
  id: string;
  from: { id: number; first_name: string; username?: string };
  chat?: { id: number };
  message_id?: number;
  data: string;
};

type Raw = Record<string, (payload: Record<string, unknown>) => Promise<unknown>>;
const raw = (api: Api) => api.raw as unknown as Raw;

export type SendWidget = {
  chat_id: number;
  html: string;
  height?: number;
  width?: number;
  chat_data?: string;
  public_data?: string;
  caption?: string;
  parse_mode?: "HTML";
  allow_queries?: boolean;
  reply_markup?: unknown;
};

export const sendWidget = (api: Api, p: SendWidget) => raw(api).sendWidget(p) as Promise<{ message_id: number }>;

export const answerWidgetQuery = (api: Api, widget_query_id: string, data?: string) =>
  raw(api).answerWidgetQuery({ widget_query_id, ...(data ? { data } : {}) });

export const editMessageWidgetData = (api: Api, chat_id: number, message_id: number, chat_data: string) =>
  raw(api).editMessageWidgetData({ chat_id, message_id, chat_data });
