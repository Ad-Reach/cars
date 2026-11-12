"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { LeadButton } from "@/components/lead/LeadModal";
import { carImg, carSrcSet, rub, type NewCarModel } from "@/lib/newCars";
import styles from "./NewCars.module.css";

export function Gallery({ car, title }: { car: NewCarModel; title: string }) {
  const [i, setI] = useState(0);
  const n = car.gallery.length;
  const go = (d: number) => setI((v) => (v + d + n) % n);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((v) => (v + 1) % n);
      if (e.key === "ArrowLeft") setI((v) => (v - 1 + n) % n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n]);

  if (!n) return null;
  const cur = car.gallery[i];

  return (
    <div className={styles.gallery}>
      <div className={styles.galStage}>
        <img
          key={cur.img}
          src={carImg(car.slug, cur.img, "w1160")}
          srcSet={carSrcSet(car.slug, cur.img)}
          sizes="(max-width: 900px) 100vw, 70vw"
          alt={cur.alt || title}
          width={1160}
          height={773}
        />
        {n > 1 && (
          <>
            <button className={`${styles.galNav} ${styles.galPrev}`} onClick={() => go(-1)} aria-label="Предыдущее фото">
              <ChevronLeft size={26} />
            </button>
            <button className={`${styles.galNav} ${styles.galNext}`} onClick={() => go(1)} aria-label="Следующее фото">
              <ChevronRight size={26} />
            </button>
          </>
        )}
        <div className={styles.galCap}>
          <span>{cur.alt}</span>
          <b>
            {String(i + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
          </b>
        </div>
      </div>
      <div className={styles.galStrip}>
        {car.gallery.map((g, k) => (
          <button key={g.img} onClick={() => setI(k)} data-on={k === i || undefined} aria-label={`Фото ${k + 1}`}>
            <img src={carImg(car.slug, g.img, "w380")} alt="" loading="lazy" width={190} height={127} />
          </button>
        ))}
      </div>
    </div>
  );
}

const SHORT_LIST = 10;

export function Trims({ car, title }: { car: NewCarModel; title: string }) {
  const [i, setI] = useState(0);
  const [more, setMore] = useState(false);
  if (!car.trims.length) return null;
  const t = car.trims[Math.min(i, car.trims.length - 1)];
  const features = more ? t.features : t.features.slice(0, SHORT_LIST);

  return (
    <div className={styles.trims}>
      {car.trims.length > 1 && (
        <div className={styles.trimTabs} role="tablist" aria-label="Комплектации">
          {car.trims.map((tr, k) => (
            <button
              key={tr.name + k}
              role="tab"
              aria-selected={k === i}
              onClick={() => {
                setI(k);
                setMore(false);
              }}
            >
              {tr.badge && <small>{tr.badge}</small>}
              <b>{tr.name}</b>
              <span>{rub(tr.price)}</span>
            </button>
          ))}
        </div>
      )}
      <div className={styles.trimPanel} role="tabpanel">
        <div className={styles.trimHead}>
          <div>
            <h3>{t.name}</h3>
            {t.sub && <p>{t.sub}</p>}
          </div>
          <div className={styles.trimPrice}>
            <b>{rub(t.price)}</b>
            <span>под ключ</span>
          </div>
        </div>
        {features.length > 0 && (
          <>
            <h4>Что входит в комплектацию</h4>
            <ul className={styles.trimList}>
              {features.map((f) => (
                <li key={f}>
                  <Check size={16} aria-hidden /> {f}
                </li>
              ))}
            </ul>
            {t.features.length > SHORT_LIST && (
              <button className={styles.moreBtn} onClick={() => setMore(!more)}>
                {more ? "Свернуть ↑" : `Показать ещё ${t.features.length - SHORT_LIST} ↓`}
              </button>
            )}
          </>
        )}
        <div className={styles.trimFoot}>
          {car.trimsNote && <p>{car.trimsNote}</p>}
          <LeadButton
            source={`new:${title} · ${t.name}`}
            title={`Заказать ${title}`}
            subtitle={`Комплектация ${t.name} — ${rub(t.price)} под ключ. Менеджер подтвердит цену и сроки.`}
            className="btn btn--gold"
          >
            Заказать эту комплектацию
          </LeadButton>
        </div>
      </div>
    </div>
  );
}
