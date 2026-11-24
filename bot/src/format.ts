import { priceText, WHEEL_NAME, type Car } from "./catalog.js";
import { escapeHtml } from "./texts.js";

// Подпись под фото машины: характеристики из таблицы («1.5 л, 103 л.с., бензин, АКПП, передний привод»)
// раскладываются по полям. Если в таблице несколько вариантов («… / …»), каждый показывается отдельной строкой.

type Variant = { volume?: string; powers: string[]; fuel: string[]; hybrid?: string; gearbox?: string; drive?: string };

const FUELS = ["бензин", "дизель", "газ", "электричество"];

function parseVariant(text: string): Variant {
  const v: Variant = { powers: [], fuel: [] };
  for (const raw of text.split(",")) {
    const t = raw.trim();
    const volume = t.match(/^(\d+(?:\.\d+)?)\s*л$/);
    const power = t.match(/^(\d+)\s*л\.с\.$/);
    if (volume) v.volume = `${volume[1]} л`;
    else if (power) v.powers.push(`${power[1]} л.с.`);
    else if (FUELS.includes(t)) v.fuel.push(t);
    else if (/гибрид/.test(t)) v.hybrid = /мягкий/.test(t) ? "мягкий гибрид" : /PHEV/.test(t) ? "подзаряжаемый гибрид (PHEV)" : "гибрид";
    else if (/привод/.test(t)) v.drive = /задн/.test(t) ? "задний" : /полн/.test(t) ? t.replace(/\s*привод\s*/, " ").trim() : "передний";
    else if (/вариатор/.test(t)) v.gearbox = "вариатор (CVT)";
    else if (t === "редуктор") v.gearbox = "редуктор";
    else if (["АКПП", "МКПП", "робот"].includes(t)) v.gearbox = t;
  }
  return v;
}

const engine = (v: Variant) =>
  [
    v.volume,
    v.powers[0],
    [...v.fuel, v.hybrid ? (v.powers[1] ? `${v.hybrid} (+${v.powers[1]})` : v.hybrid) : ""].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");

/** Подпись для Telegram (HTML): название, год, цена, руль, двигатель, коробка и привод — по строкам. */
export function carCaption(car: Car) {
  const variants = car.specs
    .split(" / ")
    .map(parseVariant)
    .filter((v) => engine(v) || v.gearbox || v.drive);
  const lines = [`<b>${escapeHtml(car.title)}</b>`, "", `📅 Год: ${escapeHtml(car.year)}`, `💰 Цена: ${priceText(car)}`, `🕹 Руль: ${WHEEL_NAME[car.wheel].replace(" руль", "")}`];
  if (variants.length === 1) {
    const v = variants[0];
    if (engine(v)) lines.push(`⚙️ Двигатель: ${engine(v)}`);
    if (v.gearbox) lines.push(`🔧 Коробка: ${v.gearbox}`);
  } else if (variants.length > 1) {
    lines.push("⚙️ Двигатели:", ...variants.map((v) => `   • ${[engine(v), v.gearbox].filter(Boolean).join(", ")}`));
  }
  const drives = [...new Set(variants.map((v) => v.drive).filter(Boolean))];
  if (drives.length) lines.push(`🚗 Привод: ${drives.join(" / ")}`);
  // в таблице характеристики есть, но разобрать их не удалось — показываем как написано
  if (car.specs && !variants.length) lines.push(`⚙️ ${escapeHtml(car.specs)}`);
  return lines.join("\n");
}
