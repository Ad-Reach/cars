import { readFileSync } from "node:fs";
import { brand } from "../brand.js";
import { QUESTIONS } from "../quiz.js";

// Страница Mini App: подставляем цвета бренда и вопросы из quiz.ts в {{...}}
const vars: Record<string, string> = {
  dark: brand.dark,
  dark2: brand.dark2,
  gold: brand.gold,
  grad: brand.gradGold,
  phone: brand.phone,
  questions: JSON.stringify(QUESTIONS.map((q) => [q.id, q.title, q.options.map((o) => [o.id, o.label])])),
};

export const miniappHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8").replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
  if (!(k in vars)) throw new Error(`miniapp: нет переменной {{${k}}}`);
  return vars[k];
});
