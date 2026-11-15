import { config } from "./config.js";
import type { CountryId, Option } from "./quiz.js";

// Машины берём с catalog.rangauto.ru: парсим HTML страниц каталога (как это делает сайт,
// см. src/lib/catalog/parse.ts в корне репозитория). Фильтр по цене каталог понимает сам
// (?price_from=&price_to=), страну выбираем по стороне руля.

export type Car = { title: string; price: number; specs: string; img: string; url: string; country: CountryId };

export const COUNTRIES: Record<CountryId, { name: string; path: string; flag: string }> = {
  cn: { name: "Китай", path: "/china-used/", flag: "🇨🇳" },
  kr: { name: "Корея", path: "/korea/", flag: "🇰🇷" },
  jp: { name: "Япония", path: "/statistika/", flag: "🇯🇵" },
};

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', lt: "<", gt: ">", mdash: "—", ndash: "–", laquo: "«", raquo: "»" };
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const meta = (block: string, prop: string) => block.match(new RegExp(`itemprop="${prop}"\\s+content="([^"]*)"`))?.[1];

export function parseCards(html: string, country: CountryId): Car[] {
  const starts = [...html.matchAll(/<div class="card-row[^"]*"[^>]*itemtype="http:\/\/schema\.org\/Car"/g)].map((m) => m.index!);
  return starts.flatMap((start, i) => {
    const block = html.slice(start, starts[i + 1] ?? start + 20000);
    const link = block.match(/class="card-row__name"\s+href="([^"]+)"\s*>([\s\S]*?)(?:<div|<\/a>)/);
    const name = (link ? text(link[2]) : "") || decode(meta(block, "name") ?? "");
    const price = Math.round(Number(meta(block, "price") ?? 0));
    const img = block.match(/<img[^>]*\ssrc="(https?:[^"]+)"/)?.[1] ?? meta(block, "image");
    if (!link || !name || !price || !img) return [];
    const age = [...(block.match(/class="card-row__age">([\s\S]*?)<\/div>/)?.[1] ?? "").matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => text(m[1]));
    const year = age.find((a) => /\d{4}/.test(a) && !/км/.test(a))?.replace(/\s*г\.?$/, "");
    const mileage = age.find((a) => /км/.test(a));
    return [
      {
        title: year ? `${name}, ${year}` : name,
        price,
        specs: [mileage].filter(Boolean).join(" · "),
        img,
        url: new URL(link[1], config.catalogOrigin).toString(),
        country,
      },
    ];
  });
}

// Грузовики и спецтехнику не показываем — ленивому покупателю легковой нужен.
// Пополняйте список, если в выдачу пролезает лишнее.
const EXCLUDE = /\b(toyoace|dyna|canter|fuso|dutro|elf|profia|ranger|condor|forward|giga|atlas|titan|quon|super great|fighter|liteace truck|townace truck|bongo truck|porter|hd\d+|xcient|mighty|bus|автобус|грузов|самосвал|эвакуатор|кран|рефрижератор|фургон)\b/i;
export const isPassenger = (car: Car) => !EXCLUDE.test(car.title);

// Последняя ошибка загрузки по стране — видна в ответе /api/cars, когда машин нет
export const catalogErrors = new Map<CountryId, string>();

// Кэш страниц на 10 минут: каталог медленный и иногда рвёт соединение
const cache = new Map<string, { at: number; cars: Car[] }>();
const TTL = 10 * 60_000;

async function fetchCars(country: CountryId, price?: [number, number]): Promise<Car[]> {
  const url = new URL(COUNTRIES[country].path, config.catalogOrigin);
  if (price) {
    if (price[0]) url.searchParams.set("price_from", String(price[0]));
    url.searchParams.set("price_to", String(price[1]));
  }
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.cars;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(key, { headers: { "User-Agent": config.catalogUserAgent }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const cars = parseCards(html, country).filter(isPassenger);
      if (!cars.length) catalogErrors.set(country, `0 карточек в ответе (${html.length} байт)`);
      else catalogErrors.delete(country);
      cache.set(key, { at: Date.now(), cars });
      return cars;
    } catch (error) {
      catalogErrors.set(country, `${String(error)}${(error as { cause?: unknown }).cause ? ` (${String((error as { cause?: unknown }).cause)})` : ""}`);
      if (attempt) console.warn("[catalog]", key, catalogErrors.get(country));
    }
  }
  return [];
}

/** Подбор: до `limit` машин в бюджете, поровну из подходящих стран, дешёвые и дорогие вперемешку. */
export async function pickCars(budget: Option | undefined, wheel: Option | undefined, limit = 4): Promise<Car[]> {
  const countries = wheel?.countries ?? (Object.keys(COUNTRIES) as CountryId[]);
  const lists = await Promise.all(
    countries.map(async (c) => {
      const cars = await fetchCars(c, budget?.price);
      // страхуемся: каталог может проигнорировать фильтр
      return budget?.price ? cars.filter((car) => car.price >= budget.price![0] && car.price <= budget.price![1]) : cars;
    }),
  );
  const result: Car[] = [];
  for (let i = 0; result.length < limit && lists.some((l) => l[i]); i++) {
    for (const l of lists) if (l[i] && result.length < limit) result.push(l[i]);
  }
  return result;
}

export const catalogLink = (wheel: Option | undefined, budget: Option | undefined) => {
  const country = wheel?.countries?.length === 1 ? wheel.countries[0] : "cn";
  const url = new URL(COUNTRIES[country].path, config.catalogOrigin);
  if (budget?.price) {
    if (budget.price[0]) url.searchParams.set("price_from", String(budget.price[0]));
    url.searchParams.set("price_to", String(budget.price[1]));
  }
  return url.toString();
};

export const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

export async function fetchImage(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": config.catalogUserAgent }, signal: AbortSignal.timeout(10000) });
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
