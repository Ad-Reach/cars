import index from "@/data/new-cars/index.json";

// Каталог новых авто из Китая (rangauto.ru/new).
// Данные обновляет scripts/sync-new-cars.py: src/data/new-cars/*.json, фото — public/new-cars/<slug>/.

export const NEW_PATH = "/new";
export { NEW_CARS_PUBLIC } from "./newCarsFlag";
export const NEW_URL = "https://rangauto.ru/new";
export const carHref = (slug: string) => `${NEW_PATH}/${slug}`;

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

export const newCars = index as NewCarSummary[];

export async function getNewCar(slug: string): Promise<NewCarModel | null> {
  if (!newCars.some((c) => c.slug === slug)) return null;
  const data = await import(`@/data/new-cars/models/${slug}.json`);
  return data.default as NewCarModel;
}

export type ImgSize = "w380" | "w760" | "w1160";

export const carImg = (slug: string, name: string, size: ImgSize = "w760") => `/new-cars/${slug}/${name}-${size}.webp`;

export const carSrcSet = (slug: string, name: string) =>
  `${carImg(slug, name, "w380")} 380w, ${carImg(slug, name, "w760")} 760w, ${carImg(slug, name, "w1160")} 1160w`;

export const rub = (n: number | null | undefined) => (n ? n.toLocaleString("ru-RU").replace(/[\s,]/g, " ") + " ₽" : "по запросу");

export const fullName = (c: { name: string; year: string }) => (c.year ? `${c.name} ${c.year}` : c.name);
