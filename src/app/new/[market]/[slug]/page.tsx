import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewCarPage } from "@/components/newcars/NewCarPage";
import { carHref, carImg, fullName, getMarket, marketList, rub } from "@/lib/newCars";
import { carsOf, getNewCar } from "@/lib/newCarsData";
import { pageMeta } from "@/lib/seo";

type Params = Promise<{ market: string; slug: string }>;

export function generateStaticParams() {
  return marketList.flatMap((m) => carsOf(m).map((c) => ({ market: m.id, slug: c.slug })));
}

async function load(params: Params) {
  const { market, slug } = await params;
  const m = getMarket(market);
  const car = m ? await getNewCar(m, slug) : null;
  return m && car ? { m, car } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await load(params);
  if (!found) return {};
  const { m, car } = found;
  const title = fullName(car);
  return pageMeta({
    title: `Купить ${title} ${m.from}${car.price ? ` от ${rub(car.price)}` : ""} под ключ | Ранг Авто`,
    description: car.description || car.lead,
    path: carHref(m, car.slug),
    image: car.gallery[0] ? carImg(m, car.slug, car.gallery[0].img, "w1160") : undefined,
  });
}

export default async function NewCarModelPage({ params }: { params: Params }) {
  const found = await load(params);
  if (!found) notFound();
  return <NewCarPage market={found.m} car={found.car} />;
}
