// Вопросы подбора. Хотите добавить/поменять вопрос — меняйте только этот файл:
// виджет, запасные кнопки, фильтр каталога и текст заявки строятся отсюда.
// Ограничения: id вопроса и варианта — латиница, коротко (запрос виджета ≤ 64 байт);
// подписи короткие — кнопки в виджете узкие.

export type CountryId = "cn" | "kr" | "jp";

export type Option = {
  id: string;
  label: string;
  // для фильтра каталога
  price?: [from: number, to: number];
  countries?: CountryId[];
};

export type Question = { id: string; title: string; options: Option[] };

export const QUESTIONS: Question[] = [
  {
    id: "b",
    title: "Бюджет",
    options: [
      { id: "1", label: "до 1,5 млн", price: [0, 1_500_000] },
      { id: "2", label: "1,5–2,5 млн", price: [1_500_000, 2_500_000] },
      { id: "3", label: "2,5–4 млн", price: [2_500_000, 4_000_000] },
      { id: "4", label: "от 4 млн", price: [4_000_000, 50_000_000] },
    ],
  },
  {
    id: "w",
    title: "Руль",
    options: [
      { id: "l", label: "Левый", countries: ["cn", "kr"] },
      { id: "r", label: "Правый", countries: ["jp"] },
      { id: "a", label: "Не важно", countries: ["cn", "kr", "jp"] },
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
