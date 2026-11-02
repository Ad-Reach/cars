"use client";

import { useEffect, useState } from "react";
import { countries, type CountryId } from "@/data/content";
import { catalogUrls } from "@/data/site";
import type { CatalogBrands, CatalogOption } from "@/lib/catalog";
import { reachGoal } from "@/lib/metrika";
import styles from "./HeroSearch.module.css";

const fallbackBrands: Record<CountryId, string[]> = {
  cn: ["BYD", "Chery", "Geely", "Haval", "Li Auto", "Zeekr", "Volkswagen", "Toyota"],
  kr: ["Hyundai", "Kia", "Genesis", "BMW", "Mercedes-Benz"],
  jp: ["Toyota", "Honda", "Nissan", "Mazda", "Subaru", "Lexus"],
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const years = Array.from({ length: 15 }, (_, i) => String(new Date().getFullYear() - i));
const budgets = [1_500_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 7_000_000, 10_000_000];
const rub = (n: number) => n.toLocaleString("ru-RU").replace(/,/g, " ") + " ₽";

function BrandOptions({ options }: { options: CatalogOption[] }) {
  const popular = options.filter((o) => o.popular);
  const render = (list: CatalogOption[]) => list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>);
  if (!popular.length || popular.length === options.length) return render(options);
  return (
    <>
      <optgroup label="Популярные">{render(popular)}</optgroup>
      <optgroup label="Все марки">{render(options.filter((o) => !o.popular))}</optgroup>
    </>
  );
}

export function HeroSearch({ brands }: { brands: CatalogBrands }) {
  const [country, setCountry] = useState<CountryId>("cn");
  const [brand, setBrand] = useState("");
  const [models, setModels] = useState<{ key: string; list: CatalogOption[] }>({ key: "", list: [] });

  const brandOptions = brands[country]?.length
    ? brands[country]
    : fallbackBrands[country].map((label) => ({ value: slug(label), label }));
  const modelKey = `${country}/${brand}`;
  const modelList = models.key === modelKey ? models.list : [];

  useEffect(() => {
    if (!brand) return;
    const controller = new AbortController();
    fetch(`/api/catalog/models?country=${country}&brand=${encodeURIComponent(brand)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { models: [] }))
      .then((data: { models: CatalogOption[] }) => setModels({ key: `${country}/${brand}`, list: data.models ?? [] }))
      .catch(() => {});
    return () => controller.abort();
  }, [country, brand]);

  function selectCountry(id: CountryId) {
    setCountry(id);
    setBrand("");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const url = new URL(catalogUrls[country]);
    for (const key of ["brand", "model", "year_from", "price_to", "min_util"]) {
      const value = form.get(key);
      if (typeof value === "string" && value) url.searchParams.set(key, value);
    }
    // Переход ждёт отправки цели, но не дольше 300 мс
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      window.location.href = url.toString();
    };
    reachGoal("catalog_search", { country, brand: url.searchParams.get("brand") ?? "" }, go);
    setTimeout(go, 300);
  }

  return (
    <form className={styles.panel} action={catalogUrls[country]} method="get" onSubmit={onSubmit}>
      <div className={styles.tabs} role="tablist" aria-label="Страна">
        {countries.map((c) => (
          <button
            type="button"
            role="tab"
            key={c.id}
            aria-selected={country === c.id}
            className={styles.tab}
            onClick={() => selectCountry(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className={styles.row}>
        <label className={styles.select}>
          <span className="visually-hidden">Марка</span>
          <select name="brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">Любая марка</option>
            <BrandOptions options={brandOptions} />
          </select>
        </label>
        <label className={styles.select}>
          <span className="visually-hidden">Модель</span>
          <select name="model" defaultValue="" key={modelKey} disabled={!modelList.length}>
            <option value="">Любая модель</option>
            {modelList.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${styles.select} ${styles.short}`}>
          <span className="visually-hidden">Год от</span>
          <select name="year_from" defaultValue="">
            <option value="">Год от</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className={`${styles.select} ${styles.short}`}>
          <span className="visually-hidden">Бюджет до</span>
          <select name="price_to" defaultValue="">
            <option value="">Бюджет до</option>
            {budgets.map((b) => (
              <option key={b} value={b}>
                {rub(b)}
              </option>
            ))}
          </select>
        </label>
        <button className={`btn btn--gold ${styles.submit}`}>Показать авто</button>
      </div>

      <label className={styles.check}>
        <input type="checkbox" name="min_util" value="1" />
        <span>
          Только с льготным утильсбором
          <small>авто до 160 л.с. - экономия до 900 тыс. ₽</small>
        </span>
      </label>
    </form>
  );
}
