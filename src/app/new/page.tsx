import { LeadButton } from "@/components/lead/LeadModal";
import { NewCatalog } from "@/components/newcars/NewCatalog";
import Link from "next/link";
import { newCars, rub } from "@/lib/newCars";
import { pageMeta } from "@/lib/seo";
import styles from "@/components/newcars/NewCars.module.css";

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const models = `${newCars.length} ${plural(newCars.length, "модель", "модели", "моделей")}`;

const minPrice = Math.min(...newCars.map((c) => c.price ?? Infinity));
const brandCount = new Set(newCars.map((c) => c.brand)).size;
const brands = `${brandCount} ${plural(brandCount, "марки", "марок", "марок")}`;

export const metadata = pageMeta({
  title: `Новые авто из Китая под заказ — ${models} от ${rub(minPrice)} под ключ | Ранг Авто`,
  description: `Новые автомобили с внутреннего рынка Китая под заказ: ${models} ${brands}, цены под ключ с доставкой, растаможкой и утильсбором. Подбор комплектации, договор, доставка 4–8 недель.`,
  path: "/new",
});

export default function NewCarsCatalogPage() {
  return (
    <main>
      <section className={styles.hero}>
        <div className={`container ${styles.heroIn}`}>
          <nav className={styles.crumbs} aria-label="Хлебные крошки">
            <Link href="/">Главная</Link>
            <span>/</span>
            <b>Новые авто из Китая</b>
          </nav>
          <h1 className={styles.heroH1}>Новые авто из Китая под заказ</h1>
          <p className={styles.heroSub}>
            {models} {brands} от {rub(minPrice)} под ключ. В цену входят доставка, таможенные
            платежи и утилизационный сбор. Срок — 4–8 недель от оплаты до выдачи.
          </p>
          <div className={styles.coverCta}>
            <a href="#catalog" className="btn btn--gold">
              Смотреть модели
            </a>
            <LeadButton source="new:каталог — подбор" title="Подобрать новый автомобиль" className="btn btn--ghost-light">
              Подобрать под бюджет
            </LeadButton>
          </div>
        </div>
      </section>
      <NewCatalog cars={newCars} />
    </main>
  );
}
