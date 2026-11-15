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
const EXCLUDE = /\b(truck|van|toyoace|dyna|canter|fuso|dutro|elf|profia|ranger|condor|forward|giga|atlas|titan|quon|super great|fighter|liteace truck|townace truck|bongo truck|porter|hd\d+|xcient|mighty|bus|автобус|грузов|самосвал|эвакуатор|кран|рефрижератор|фургон)\b/i;
export const isPassenger = (car: Car) => !EXCLUDE.test(car.title);

// Последняя ошибка загрузки по стране — видна в ответе /api/cars, когда машин нет
export const catalogErrors = new Map<CountryId, string>();

// Кэш страниц: свежий — 10 минут; при сбое каталога отдаём последний удачный ответ (до суток).
// Каталог плохо переносит параллельные подключения с одного IP (из Амстердама — таймауты),
// поэтому все запросы к нему идут строго по очереди, а кэш прогревается в фоне (warmCatalog).
const cache = new Map<string, { at: number; cars: Car[] }>();
const TTL = 10 * 60_000;
const STALE_TTL = 24 * 60 * 60_000;

let queue: Promise<unknown> = Promise.resolve();
const inQueue = <T>(job: () => Promise<T>): Promise<T> => {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
};

const describeError = (error: unknown) => {
  const cause = (error as { cause?: unknown }).cause;
  return `${String(error)}${cause ? ` (${String(cause)})` : ""}`;
};

function catalogUrl(country: CountryId, price?: [number, number]) {
  const url = new URL(COUNTRIES[country].path, config.catalogOrigin);
  if (price) {
    if (price[0]) url.searchParams.set("price_from", String(price[0]));
    url.searchParams.set("price_to", String(price[1]));
  }
  return url.toString();
}

async function load(country: CountryId, key: string): Promise<Car[] | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(key, { headers: { "User-Agent": config.catalogUserAgent }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const cars = parseCards(html, country).filter(isPassenger);
      if (!cars.length) catalogErrors.set(country, `0 карточек в ответе (${html.length} байт)`);
      else catalogErrors.delete(country);
      cache.set(key, { at: Date.now(), cars });
      return cars;
    } catch (error) {
      catalogErrors.set(country, describeError(error));
      if (attempt === 3) console.warn("[catalog]", key, catalogErrors.get(country));
      else await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  return null;
}

async function fetchCars(country: CountryId, price?: [number, number]): Promise<Car[]> {
  const key = catalogUrl(country, price);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.cars;
  const fresh = await inQueue(() => load(country, key));
  if (fresh) return fresh;
  // каталог не ответил — показываем то, что было (если не слишком старое)
  return hit && Date.now() - hit.at < STALE_TTL ? hit.cars : [];
}

/** Фоновый прогрев: все страны × все бюджеты, по очереди. Запускается при старте и раз в 10 минут. */
export function warmCatalog(budgets: (Option | undefined)[]) {
  const run = async () => {
    for (const b of budgets) for (const c of Object.keys(COUNTRIES) as CountryId[]) await fetchCars(c, b?.price);
  };
  void run();
  setInterval(() => void run(), TTL).unref();
}

/** Подбор: до `limit` машин в бюджете, поровну из подходящих стран, дешёвые и дорогие вперемешку. */
export async function pickCars(budget: Option | undefined, wheel: Option | undefined, limit = 4): Promise<Car[]> {
  const countries = wheel?.countries ?? (Object.keys(COUNTRIES) as CountryId[]);
  const lists: Car[][] = [];
  for (const c of countries) {
    const cars = await fetchCars(c, budget?.price);
    // страхуемся: каталог может проигнорировать фильтр
    lists.push(budget?.price ? cars.filter((car) => car.price >= budget.price![0] && car.price <= budget.price![1]) : cars);
  }
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
