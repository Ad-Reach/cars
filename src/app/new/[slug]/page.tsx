import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewCarPage } from "@/components/newcars/NewCarPage";
import { carImg, fullName, getNewCar, newCars, NEW_URL, rub } from "@/lib/newCars";
import { pageMeta } from "@/lib/seo";

export function generateStaticParams() {
  return newCars.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const car = await getNewCar((await params).slug);
  if (!car) return {};
  const title = fullName(car);
  return pageMeta({
    title: `Купить ${title} из Китая${car.price ? ` от ${rub(car.price)}` : ""} под ключ | Ранг Авто`,
    description: car.description || car.lead,
    path: `/${car.slug}`,
    origin: NEW_URL,
    image: car.gallery[0] ? carImg(car.slug, car.gallery[0].img, "w1160") : undefined,
  });
}

export default async function NewCarModelPage({ params }: { params: Promise<{ slug: string }> }) {
  const car = await getNewCar((await params).slug);
  if (!car) notFound();
  return <NewCarPage car={car} />;
}
