"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { LeadButton } from "@/components/lead/LeadModal";
import { carHref, carImg, carSrcSet, fullName, rub, type NewCarSummary } from "@/lib/newCars";
import styles from "./NewCars.module.css";

type Sort = "price" | "-price" | "name";

const PRICE_STEPS = [
  { label: "Любая", max: Infinity },
  { label: "до 2,5 млн", max: 2_500_000 },
  { label: "до 3,5 млн", max: 3_500_000 },
  { label: "до 5 млн", max: 5_000_000 },
  { label: "до 7 млн", max: 7_000_000 },
];

const uniq = (list: (string | undefined)[]) =>
  [...new Set(list.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "ru"));

export function NewCatalog({ cars }: { cars: NewCarSummary[] }) {
  const [brand, setBrand] = useState("");
  const [fuel, setFuel] = useState("");
  const [body, setBody] = useState("");
  const [drive, setDrive] = useState("");
  const [price, setPrice] = useState(0);
  const [sort, setSort] = useState<Sort>("price");
  const [panel, setPanel] = useState(false);

  const options = useMemo(
    () => ({
      brands: uniq(cars.map((c) => c.brand)),
      fuels: uniq(cars.map((c) => c.fuel)),
      bodies: uniq(cars.map((c) => c.body)),
      drives: uniq(cars.map((c) => c.drive)),
    }),
    [cars],
  );

  const list = useMemo(() => {
    const max = PRICE_STEPS[price].max;
    const res = cars.filter(
      (c) =>
        (!brand || c.brand === brand) &&
        (!fuel || c.fuel === fuel) &&
        (!body || c.body === body) &&
        (!drive || c.drive === drive) &&
        (c.price ?? 0) <= max,
    );
    const p = (c: NewCarSummary) => c.price ?? Number.MAX_SAFE_INTEGER;
    return res.sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "price" ? p(a) - p(b) : p(b) - p(a),
    );
  }, [cars, brand, fuel, body, drive, price, sort]);

  const active = [brand, fuel, body, drive].filter(Boolean).length + (price ? 1 : 0);
  const reset = () => {
    setBrand("");
    setFuel("");
    setBody("");
    setDrive("");
    setPrice(0);
  };

  return (
    <section className="section section--light" id="catalog">
      <div className="container">
        <div className={styles.brands} role="group" aria-label="Марка">
          <button className={styles.brandChip} aria-pressed={!brand} onClick={() => setBrand("")}>
            Все марки <span>{cars.length}</span>
          </button>
          {options.brands.map((b) => (
            <button
              key={b}
              className={styles.brandChip}
              aria-pressed={brand === b}
              onClick={() => setBrand(brand === b ? "" : b)}
            >
              {b} <span>{cars.filter((c) => c.brand === b).length}</span>
            </button>
          ))}
        </div>

        <div className={styles.toolbar}>
          <button className={`btn btn--outline ${styles.filtersBtn}`} onClick={() => setPanel(true)}>
            <SlidersHorizontal size={18} /> Фильтры{active ? ` · ${active}` : ""}
          </button>
          <div className={styles.filters} data-open={panel || undefined}>
            <div className={styles.filtersHead}>
              <b>Фильтры</b>
              <button onClick={() => setPanel(false)} aria-label="Закрыть фильтры">
                <X size={24} />
              </button>
            </div>
            <Select label="Двигатель" value={fuel} onChange={setFuel} options={options.fuels} />
            <Select label="Кузов" value={body} onChange={setBody} options={options.bodies} />
            <Select label="Привод" value={drive} onChange={setDrive} options={options.drives} />
            <label className={styles.field}>
              <span>Цена под ключ</span>
              <select value={price} onChange={(e) => setPrice(Number(e.target.value))}>
                {PRICE_STEPS.map((s, i) => (
                  <option key={s.label} value={i}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Сортировка</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="price">Сначала дешевле</option>
                <option value="-price">Сначала дороже</option>
                <option value="name">По названию</option>
              </select>
            </label>
            {active > 0 && (
              <button className={styles.reset} onClick={reset}>
                Сбросить
              </button>
            )}
            <button className={`btn btn--gold ${styles.applyBtn}`} onClick={() => setPanel(false)}>
              Показать {list.length}
            </button>
          </div>
        </div>

        {list.length ? (
          <div className={styles.grid}>
            {list.map((car) => (
              <NewCarCard key={car.slug} car={car} />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <p>Под эти фильтры моделей нет — подберём автомобиль под ваш запрос.</p>
            <LeadButton source="new:каталог — пустая выдача" title="Подобрать новый автомобиль" className="btn btn--gold">
              Подобрать под заказ
            </LeadButton>
          </div>
        )}
      </div>
    </section>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Любой</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NewCarCard({ car }: { car: NewCarSummary }) {
  const [shown, setShown] = useState(0);
  const photos = car.photos.length ? car.photos : [];
  const title = fullName(car);
  const specs = [
    ["Двиг.", car.engine],
    ["Мощн.", car.power],
    ["Привод", car.drive],
    ["Кузов", car.body],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <article className={styles.card}>
      <a href={carHref(car.slug)} className={styles.cardPhoto} onMouseLeave={() => setShown(0)}>
        {photos[shown] && (
          <img
            src={carImg(car.slug, photos[shown], "w760")}
            srcSet={carSrcSet(car.slug, photos[shown])}
            sizes="(max-width: 640px) 92vw, (max-width: 1100px) 46vw, 30vw"
            alt={title}
            loading="lazy"
            width={760}
            height={507}
          />
        )}
        {photos.length > 1 && (
          <span className={styles.zones} aria-hidden>
            {photos.map((p, i) => (
              <span key={p} onMouseEnter={() => setShown(i)} data-on={i === shown || undefined} />
            ))}
          </span>
        )}
        <span className={styles.badges}>
          {car.labels?.map((l) => (
            <span key={l} className={styles.badgeHot}>
              {l}
            </span>
          ))}
          {car.fuel && <span className={styles.badge}>{car.fuel}</span>}
        </span>
      </a>
      <div className={styles.cardBody}>
        <a href={carHref(car.slug)} className={styles.cardTitle}>
          {car.name} <span>{car.year}</span>
        </a>
        {specs.length > 0 && (
          <dl className={styles.cardSpecs}>
            {specs.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className={styles.cardPrice}>
          <span>Цена под ключ</span>
          <b>
            {car.price ? (car.priceMax && car.priceMax > car.price ? `от ${rub(car.price)}` : rub(car.price)) : "по запросу"}
          </b>
        </div>
        <div className={styles.cardActions}>
          <a href={carHref(car.slug)} className="btn btn--gold">
            Подробнее
          </a>
          <LeadButton
            source={`new:${title}`}
            title={`Консультация по ${title}`}
            className="btn btn--outline"
          >
            Консультация
          </LeadButton>
        </div>
      </div>
    </article>
  );
}
