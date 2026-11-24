import type { Car } from "./catalog.js";
import type { WheelChoice } from "./flow.js";
import type { Wheel } from "./quiz.js";

// Состояние пользователя. Хранится в памяти процесса — при перезапуске бота сбрасывается.
// Когда понадобится надёжность — заменить Map на Redis/S3/БД, интерфейс тот же.

/** Анкета клиента: что он уже ответил. step — какой ответ бот ждёт текстом. */
export type Form = {
  wheel?: WheelChoice;
  budget?: string;
  condition?: string;
  city?: string;
  /** машина, на которую клиент просит расчёт («Получить расчёт стоимости») */
  car?: Car;
  /** машина, похожую на которую просит подобрать клиент */
  similarTo?: Car;
  /** телефон; пусто, если клиент выбрал «Связаться со мной в Telegram» */
  phone?: string;
  viaTelegram?: boolean;
  consent?: boolean;
  /** вопрос, который бот задал последним; city/phone ждут ответ текстом */
  at?: "wheel" | "budget" | "condition" | "city" | "phone" | "consent";
};

export type Session = {
  form: Form;
  // выбранная категория каталога (руль + id бюджета из flow.ts)
  sel?: { wheel: Wheel; budget: string };
  // подобранные машины и сколько из них уже показано (по кнопке «Показать ещё» — следующие)
  shown: Car[];
  // что хотел начать клиент, пока на экране вопрос «продолжить или создать новую заявку»
  pending?: { kind: "lead" | "calc" | "sim"; carId?: string };
  shownCount: number;
  // карточка заявки у клиента (виджет) — её обновляют кнопки статуса у менеджеров
  leadCard?: { messageId: number; data: { rows: [string, string][]; url: string; step: number } };
  leadSentAt?: number;
};

const sessions = new Map<number, Session>();

export function getSession(userId: number): Session {
  let s = sessions.get(userId);
  if (!s) {
    s = { form: {}, shown: [], shownCount: 0 };
    sessions.set(userId, s);
  }
  return s;
}

export const resetSession = (userId: number) => sessions.delete(userId);
