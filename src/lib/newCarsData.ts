import chinaIndex from "@/data/new-cars/index.json";
import uaeIndex from "@/data/new-cars-uae/index.json";
import uaeModels from "@/data/new-cars-uae/models.json";
import { plural, type Market, type MarketId, type NewCarModel, type NewCarSummary } from "./newCars";

// Данные каталогов новых авто (только на сервере, чтобы JSON не попадал в браузер).

const CARS: Record<MarketId, NewCarSummary[]> = {
  china: chinaIndex as NewCarSummary[],
  uae: uaeIndex as NewCarSummary[],
};

export const carsOf = (m: Market) => CARS[m.id];

// Китай: по файлу на модель (их много, грузим по требованию). ОАЭ: все модели в одном models.json.
// Пути импорта должны быть статичными, поэтому отдельная ветка на каждый рынок.
const loadModel: Record<MarketId, (slug: string) => Promise<unknown>> = {
  china: async (slug) => (await import(`@/data/new-cars/models/${slug}.json`)).default,
  uae: async (slug) => (uaeModels as Record<string, unknown>)[slug],
};

export async function getNewCar(m: Market, slug: string): Promise<NewCarModel | null> {
  if (!CARS[m.id].some((c) => c.slug === slug)) return null;
  return ((await loadModel[m.id](slug)) as NewCarModel | undefined) ?? null;
}

export function marketStats(m: Market) {
  const cars = carsOf(m);
  const prices = cars.map((c) => c.price).filter((p): p is number => !!p);
  const brandCount = new Set(cars.map((c) => c.brand)).size;
  return {
    count: cars.length,
    models: `${cars.length} ${plural(cars.length, "модель", "модели", "моделей")}`,
    brands: `${brandCount} ${plural(brandCount, "марки", "марок", "марок")}`,
    minPrice: prices.length ? Math.min(...prices) : null,
  };
}
