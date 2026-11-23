import Link from "next/link";
import { marketList, rub } from "@/lib/newCars";
import { marketStats } from "@/lib/newCarsData";
import { pageMeta } from "@/lib/seo";
import styles from "@/components/newcars/NewCars.module.css";

export const metadata = pageMeta({
  title: "Новые авто под заказ из Китая и ОАЭ — цены под ключ | Ранг Авто",
  description:
    "Новые автомобили под заказ из Китая и ОАЭ: цены под ключ с доставкой, растаможкой и утильсбором. Подбор комплектации, договор.",
  path: "/new",
});

// rangauto.ru/new — выбор рынка: /new/china, /new/uae
export default function NewCarsMarketsPage() {
  return (
    <main>
      <section className={styles.hero}>
        <div className={`container ${styles.heroIn}`}>
          <nav className={styles.crumbs} aria-label="Хлебные крошки">
            <Link href="/">Главная</Link>
            <span>/</span>
            <b>Новые авто</b>
          </nav>
          <h1 className={styles.heroH1}>Новые авто под заказ</h1>
          <p className={styles.heroSub}>
            Цены под ключ: доставка, таможенные платежи и утилизационный сбор уже включены. Выберите страну.
          </p>
        </div>
      </section>
      <section className="section section--light">
        <div className={`container ${styles.markets}`}>
          {marketList.map((m) => {
            const s = marketStats(m);
            return (
              <Link key={m.id} href={m.path} className={styles.market}>
                <b>{m.title}</b>
                <span>
                  {s.count
                    ? `${s.models} ${s.brands}${s.minPrice ? ` от ${rub(s.minPrice)}` : ""}`
                    : "Каталог наполняется — подбор под заказ"}
                </span>
                <em>Смотреть →</em>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
