import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { brand } from "../brand.js";
import { QUESTIONS } from "../quiz.js";

// HTML виджетов лежит рядом (*.html). Подставляем цвета бренда и вопросы ({{...}}),
// затем проверяем лимиты Telegram: ≤ 32768 байт и ≤ 4096 байт после zlib-сжатия.

const vars: Record<string, string> = {
  dark: brand.dark,
  dark2: brand.dark2,
  gold: brand.gold,
  grad: brand.gradGold,
  site: brand.site,
  // компактно: [id, заголовок, [[id, подпись], ...]]
  questions: JSON.stringify(QUESTIONS.map((q) => [q.id, q.title, q.options.map((o) => [o.id, o.label])])),
};

function build(name: string) {
  const src = readFileSync(new URL(`./${name}.html`, import.meta.url), "utf8");
  const html = src
    .replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
      if (!(k in vars)) throw new Error(`widget ${name}: нет переменной {{${k}}}`);
      return vars[k];
    })
    // убираем отступы и переносы — экономим лимит
    .replace(/\n\s*/g, "\n")
    .trim();
  const size = Buffer.byteLength(html);
  const packed = deflateSync(html, { level: 9 }).length;
  if (size > 32768 || packed > 4096) throw new Error(`widget ${name}: ${size} байт, сжато ${packed} — больше лимита Telegram`);
  return { html, size, packed };
}

export const widgets = { quiz: build("quiz"), lead: build("lead") };
