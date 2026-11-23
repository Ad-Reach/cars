// Каталоги новых авто под заказ: rangauto.ru/new/<рынок>/<модель>.
//   /new/china — из Китая. Данные: scripts/sync-new-cars.py → src/data/new-cars/, фото — public/new-cars/<slug>/.
//   /new/uae   — из ОАЭ.   Данные выгружены один раз (scripts/import-new-cars-uae.py) → src/data/new-cars-uae/
//                          (index.json + models.json), фото с Яндекс.Диска — public/new-cars-uae/<slug>/.
// /new — выбор рынка. Тестовый режим и доступ по ключу — src/lib/newCarsFlag.ts и src/proxy.ts.
// Здесь — общее для сервера и браузера; чтение данных каталога — src/lib/newCarsData.ts (только сервер).

export const NEW_PATH = "/new";
export { NEW_CARS_PUBLIC } from "./newCarsFlag";

export type MarketId = "china" | "uae";

export type Market = {
  id: MarketId;
  path: string; // /new/china
  url: string; // https://rangauto.ru/new/china
  country: string; // Китай
  from: string; // из Китая
  title: string; // Новые авто из Китая
  origin: string; // с внутреннего рынка Китая
  images: string; // /new-cars — папка фото в public/
  term: string | null; // срок от оплаты до выдачи, если известен
  hero: string | null; // фон первого экрана каталога: /img/new/<имя> → <имя>-w760.webp и -w1280.webp
};

export const MARKETS: Record<MarketId, Market> = {
  china: {
    id: "china",
    path: `${NEW_PATH}/china`,
    url: `https://rangauto.ru${NEW_PATH}/china`,
    country: "Китай",
    from: "из Китая",
    title: "Новые авто из Китая",
    origin: "с внутреннего рынка Китая",
    images: "/new-cars",
    term: "4–8 недель",
    hero: "/img/new/china-hero",
  },
  uae: {
    id: "uae",
    path: `${NEW_PATH}/uae`,
    url: `https://rangauto.ru${NEW_PATH}/uae`,
    country: "ОАЭ",
    from: "из ОАЭ",
    title: "Новые авто из ОАЭ",
    origin: "с рынка ОАЭ",
    images: "/new-cars-uae",
    term: null,
    hero: "/img/new/uae-hero",
  },
};

export const marketList = Object.values(MARKETS);
export const getMarket = (id: string): Market | null => (id in MARKETS ? MARKETS[id as MarketId] : null);

export type NewCarSummary = {
  slug: string;
  name: string;
  year: string;
  brand: string;
  tag: string;
  fuel: string;
  engine?: string;
  power?: string;
  drive?: string;
  gearbox?: string;
  body?: string;
  price: number | null;
  priceMax?: number | null;
  labels?: string[];
  photos: string[];
};

export type NewCarModel = {
  slug: string;
  name: string;
  year: string;
  brand: string;
  model: string;
  tag: string;
  price: number | null;
  lead: string;
  ribbon: { value: string; label: string }[];
  galleryIntro: string;
  gallery: { img: string; alt: string }[];
  chapters: { eyebrow: string; title: string; accent: string; text: string; img: string | null; alt: string; dark: boolean }[];
  trims: { name: string; sub: string; badge: string; price: number | null; features: string[] }[];
  trimsNote: string;
  specs: [string, string][];
  faq: { q: string; a: string }[];
  similar: string[];
  fuelType: string;
  powerHp: number | null;
  bodyType: string;
  transmission: string;
  description: string;
};

export const carHref = (m: Market, slug: string) => `${m.path}/${slug}`;

// источник заявки для /api/lead: «new-china:…», «new-uae:…»
export const leadSource = (m: Market, what: string) => `new-${m.id}:${what}`;

export type ImgSize = "w380" | "w760" | "w1160";

export const carImg = (m: Market, slug: string, name: string, size: ImgSize = "w760") =>
  `${m.images}/${slug}/${name}-${size}.webp`;

export const carSrcSet = (m: Market, slug: string, name: string) =>
  `${carImg(m, slug, name, "w380")} 380w, ${carImg(m, slug, name, "w760")} 760w, ${carImg(m, slug, name, "w1160")} 1160w`;

export const rub = (n: number | null | undefined) => (n ? n.toLocaleString("ru-RU").replace(/[\s,]/g, " ") + " ₽" : "по запросу");

export const fullName = (c: { name: string; year: string }) => (c.year ? `${c.name} ${c.year}` : c.name);

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
