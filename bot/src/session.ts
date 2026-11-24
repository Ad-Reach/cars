import type { Answers } from "./quiz.js";
import type { Car } from "./catalog.js";

// Состояние пользователя. Хранится в памяти процесса — при перезапуске бота сбрасывается.
// Когда понадобится надёжность — заменить Map на Redis/S3/БД, интерфейс тот же.

export type Session = {
  answers: Answers;
  // подобранные машины и сколько из них уже показано (по кнопке «Показать ещё» — следующие)
  shown: Car[];
  shownCount: number;
  car?: Car;
  // что пользователь написал текстом («хочу камри»)
  comment?: string;
  // карточка заявки у клиента (виджет) — её обновляют кнопки статуса у менеджеров
  leadCard?: { messageId: number; data: { rows: [string, string][]; url: string; step: number } };
  leadSentAt?: number;
  // сообщение с виджетом подбора — чтобы обновлять его состояние
  quizMessageId?: number;
};

const sessions = new Map<number, Session>();

export function getSession(userId: number): Session {
  let s = sessions.get(userId);
  if (!s) {
    s = { answers: {}, shown: [], shownCount: 0 };
    sessions.set(userId, s);
  }
  return s;
}

export const resetSession = (userId: number) => sessions.delete(userId);
