// Вопросы подбора. Хотите добавить/поменять вопрос — меняйте только этот файл:
// виджет, запасные кнопки, фильтр каталога и текст заявки строятся отсюда.
// Ограничения: id вопроса и варианта — латиница, коротко (запрос виджета ≤ 64 байт);
// подписи короткие — кнопки в виджете узкие.

export type Wheel = "l" | "r";

export type Option = {
  id: string;
  label: string;
  // для фильтра каталога: цена от (включительно) до (не включая)
  price?: [from: number, to: number];
  wheels?: Wheel[];
};

export type Question = { id: string; title: string; options: Option[] };

export const QUESTIONS: Question[] = [
  {
    id: "b",
    title: "Бюджет",
    options: [
      // те же границы, что у вкладок таблицы с машинами
      { id: "1", label: "до 2 млн", price: [0, 2_000_000] },
      { id: "2", label: "2–3 млн", price: [2_000_000, 3_000_000] },
      { id: "3", label: "3–4 млн", price: [3_000_000, 4_000_000] },
      { id: "4", label: "от 4 млн", price: [4_000_000, Infinity] },
    ],
  },
  {
    id: "w",
    title: "Руль",
    options: [
      { id: "l", label: "Левый", wheels: ["l"] },
      { id: "r", label: "Правый", wheels: ["r"] },
      { id: "a", label: "Не важно", wheels: ["l", "r"] },
    ],
  },
  {
    id: "t",
    title: "Когда нужна машина",
    options: [
      { id: "1", label: "Сейчас" },
      { id: "2", label: "1–3 мес" },
      { id: "3", label: "Смотрю" },
    ],
  },
];

// Ответы пользователя: { b: "2", w: "l", t: "1" }
export type Answers = Record<string, string>;

export const findOption = (questionId: string, optionId: string | undefined) =>
  QUESTIONS.find((q) => q.id === questionId)?.options.find((o) => o.id === optionId);

export const isComplete = (a: Answers) => QUESTIONS.every((q) => findOption(q.id, a[q.id]));

/** Ответы человеческим текстом: [["Бюджет", "1,5–2,5 млн"], ...] */
export const describe = (a: Answers) =>
  QUESTIONS.flatMap((q) => {
    const o = findOption(q.id, a[q.id]);
    return o ? [[q.title, o.label] as const] : [];
  });
