import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadButton } from "@/components/lead/LeadModal";
import { NewCatalog } from "@/components/newcars/NewCatalog";
import { getMarket, leadSource, marketList, NEW_PATH, rub, type Market } from "@/lib/newCars";
import { carsOf, marketStats } from "@/lib/newCarsData";
import { pageMeta } from "@/lib/seo";
import styles from "@/components/newcars/NewCars.module.css";

type Params = Promise<{ market: string }>;

export function generateStaticParams() {
  return marketList.map((m) => ({ market: m.id }));
}

const termText = (m: Market) => (m.term ? ` Срок — ${m.term} от оплаты до выдачи.` : "");

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const m = getMarket((await params).market);
  if (!m) return {};
  const s = marketStats(m);
  const range = s.count ? ` — ${s.models}${s.minPrice ? ` от ${rub(s.minPrice)}` : ""} под ключ` : "";
  return pageMeta({
    title: `${m.title} под заказ${range} | Ранг Авто`,
    description: `Новые автомобили ${m.origin} под заказ${s.count ? `: ${s.models} ${s.brands}` : ""}, цены под ключ с доставкой, растаможкой и утильсбором. Подбор комплектации, договор.${termText(m)}`,
    path: m.path,
  });
}

export default async function NewCarsMarketPage({ params }: { params: Params }) {
  const m = getMarket((await params).market);
  if (!m) notFound();
  const cars = carsOf(m);
  const s = marketStats(m);

  return (
    <main>
      <section className={styles.hero} data-photo={m.hero ? true : undefined}>
        {m.hero && (
          <img
            className={styles.heroBg}
            src={`${m.hero}-w1280.webp`}
            srcSet={`${m.hero}-w760.webp 760w, ${m.hero}-w1280.webp 1280w`}
            sizes="100vw"
            alt=""
            aria-hidden
            fetchPriority="high"
          />
        )}
        <div className={`container ${styles.heroIn}`}>
          <nav className={styles.crumbs} aria-label="Хлебные крошки">
            <Link href="/">Главная</Link>
            <span>/</span>
            <Link href={NEW_PATH}>Новые авто</Link>
            <span>/</span>
            <b>{m.title}</b>
          </nav>
          <h1 className={styles.heroH1}>{m.title} под заказ</h1>
          <p className={styles.heroSub}>
            {s.count ? (
              <>
                {s.models} {s.brands}
                {s.minPrice ? ` от ${rub(s.minPrice)}` : ""} под ключ.
              </>
            ) : (
              <>Каталог наполняется — подберём модель {m.from} под ваш запрос уже сейчас.</>
            )}{" "}
            В цену входят доставка, таможенные платежи и утилизационный сбор.{termText(m)}
          </p>
          <div className={styles.coverCta}>
            {s.count > 0 && (
              <a href="#catalog" className="btn btn--gold">
                Смотреть модели
              </a>
            )}
            <LeadButton
              source={leadSource(m, "каталог — подбор")}
              title="Подобрать новый автомобиль"
              className={s.count ? "btn btn--ghost-light" : "btn btn--gold"}
            >
              Подобрать под бюджет
            </LeadButton>
          </div>
        </div>
      </section>
      {s.count > 0 && <NewCatalog market={m} cars={cars} />}
    </main>
  );
}
