import { readFileSync } from "node:fs";
import { config } from "./config.js";
import type { Option, Wheel } from "./quiz.js";

// Машины берём из Google-таблицы: bot/data/cars.json и фото bot/data/photos/<id>.jpg.
// Файлы обновляет скрипт scripts/import-sheet.py (инструкция — в нём и в AGENTS.md).
// С catalog.rangauto.ru бот берёт только ссылки «Похожие» (список марок).

export type Car = {
  id: string;
  brand: string;
  model: string;
  title: string;
  price: number;
  /** true — в таблице цена «от …», false — точная */
  from: boolean;
  year: string;
  specs: string;
  wheel: Wheel;
  tab: string;
  photo: boolean;
};

const DATA = new URL("../data/", import.meta.url);
const ALL: Car[] = JSON.parse(readFileSync(new URL("cars.json", DATA), "utf8"));
const BY_ID = new Map(ALL.map((c) => [c.id, c]));
console.log(`Каталог: ${ALL.length} машин из таблицы, с фото ${ALL.filter((c) => c.photo).length}`);

export const WHEEL_NAME: Record<Wheel, string> = { l: "левый руль", r: "правый руль" };

export const carById = (id: string) => BY_ID.get(id);

/** Путь к файлу фото (или undefined, если фото нет). */
export const photoFile = (car: Car) => (car.photo ? new URL(`photos/${car.id}.jpg`, DATA) : undefined);

/** Подбор: все машины нужного руля и бюджета, от дешёвых к дорогим. */
export function pickCars(budget: Option | undefined, wheel: Option | undefined): Car[] {
  const wheels = wheel?.wheels ?? ["l", "r"];
  const [from, to] = budget?.price ?? [0, Infinity];
  return ALL.filter((c) => wheels.includes(c.wheel) && c.price >= from && c.price < to).sort((a, b) => a.price - b.price);
}

export const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;
export const priceText = (car: Car) => `${car.from ? "от " : ""}${rub(car.price)}`;

// ---------- Ссылки на каталог rangauto.ru ----------
// «Похожие» ведёт на страницу марки в каталоге нужной страны (левый руль — Китай/Корея, правый — Япония).
// Список марок каталога грузим в фоне и кэшируем; пока не загрузился — ссылка на страну целиком.

type CatalogCountry = { path: string; wheel: Wheel };
const COUNTRIES: CatalogCountry[] = [
  { path: "/china-used/", wheel: "l" },
  { path: "/korea/", wheel: "l" },
  { path: "/statistika/", wheel: "r" },
];

const brandCache = new Map<string, { value: string; label: string }[]>();
const flat = (s: string) => s.toLowerCase().replace(/[^a-zа-я0-9]/g, "");

async function loadBrands(path: string) {
  try {
    const res = await fetch(new URL(path, config.catalogOrigin), { headers: { "User-Agent": config.catalogUserAgent }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const select = html.match(/<select[^>]*name="brand"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? "";
    const options = [...select.matchAll(/<option[^>]*value=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/option>/g)].map((m) => ({
      value: m[1],
      label: m[2].replace(/<[^>]+>/g, "").replace(/\s*\([\d\s]+\)\s*$/, "").trim(),
    }));
    if (options.length) brandCache.set(path, options);
  } catch (error) {
    console.warn("[catalog] список марок", path, String(error));
  }
}

/** Фоновая загрузка списков марок (по очереди — каталог не любит параллельные запросы). Раз в 6 часов. */
export function warmCatalog() {
  const run = async () => {
    for (const c of COUNTRIES) await loadBrands(c.path);
  };
  void run();
  setInterval(() => void run(), 6 * 60 * 60_000).unref();
}

/** Ссылка «Похожие»: марка машины в каталоге, а если не нашли — каталог страны с нужным рулём. */
export function similarUrl(car: Car): string {
  const countries = COUNTRIES.filter((c) => c.wheel === car.wheel);
  const brand = flat(car.brand);
  for (const c of countries) {
    const hit = brandCache.get(c.path)?.find((o) => flat(o.label) === brand || flat(o.label).startsWith(brand));
    if (hit) return new URL(`${c.path}${hit.value}/`, config.catalogOrigin).toString();
  }
  return new URL(countries[0].path, config.catalogOrigin).toString();
}

/** «Все варианты в каталоге» под списком: каталог страны по рулю и бюджету. */
export const catalogLink = (wheel: Option | undefined, budget: Option | undefined) => {
  const url = new URL(wheel?.wheels?.length === 1 && wheel.wheels[0] === "r" ? "/statistika/" : "/china-used/", config.catalogOrigin);
  if (budget?.price) {
    if (budget.price[0]) url.searchParams.set("price_from", String(budget.price[0]));
    if (Number.isFinite(budget.price[1])) url.searchParams.set("price_to", String(budget.price[1]));
  }
  return url.toString();
};
