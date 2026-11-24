import type { Car } from "./catalog.js";
import type { Wheel } from "./quiz.js";

// Сценарий диалога с ботом: варианты ответов в кнопках (руль, бюджет, состояние авто).
// Бюджеты совпадают с вкладками таблицы с машинами.

export type WheelChoice = Wheel | "a";
export type Budget = { id: string; label: string; price: [from: number, to: number] };

const M = 1_000_000;
const LEFT: Budget[] = [
  { id: "1", label: "До 2 млн ₽", price: [0, 2 * M] },
  { id: "2", label: "2–3 млн ₽", price: [2 * M, 3 * M] },
  { id: "3", label: "3–4 млн ₽", price: [3 * M, 4 * M] },
  { id: "4", label: "От 4 млн ₽", price: [4 * M, Infinity] },
];
const RIGHT: Budget[] = [
  { id: "1", label: "До 2 млн ₽", price: [0, 2 * M] },
  { id: "2", label: "От 2 млн ₽", price: [2 * M, Infinity] },
];

/** Бюджеты для руля: у правого руля две категории, у левого (и «оба варианта») четыре. */
export const budgetsFor = (wheel: WheelChoice): Budget[] => (wheel === "r" ? RIGHT : LEFT);

export const WHEEL_CHOICES: { id: WheelChoice; label: string }[] = [
  { id: "l", label: "Левый руль" },
  { id: "r", label: "Правый руль" },
  { id: "a", label: "Рассматриваю оба варианта" },
];
export const wheelLabel = (id: WheelChoice | undefined) => WHEEL_CHOICES.find((w) => w.id === id)?.label ?? "";

export const CONDITIONS = [
  { id: "n", label: "Новый автомобиль" },
  { id: "u", label: "Автомобиль с пробегом" },
  { id: "a", label: "Рассматриваю оба варианта" },
];

/** «до 2 млн ₽», «от 2 до 3 млн ₽», «от 4 млн ₽» */
export function budgetPhrase(b: Budget) {
  const [from, to] = b.price;
  if (!from) return `до ${to / M} млн ₽`;
  if (!Number.isFinite(to)) return `от ${from / M} млн ₽`;
  return `от ${from / M} до ${to / M} млн ₽`;
}

/** Категория бюджета, в которую попадает цена машины (у правого руля — свои категории). */
export const bracketOf = (car: Car) => budgetsFor(car.wheel).find((b) => car.price >= b.price[0] && car.price < b.price[1]);

export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
