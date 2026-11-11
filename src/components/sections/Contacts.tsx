"use client";

import { useState } from "react";
import { MousePointerClick } from "lucide-react";
import { telHref } from "@/data/site";
import type { Site } from "@/lib/content";
import styles from "./Contacts.module.css";

// Виджет Яндекс Карт не требует ключа. Тёмная тема — CSS-фильтром (см. .mapFrame).
function mapUrl([lat, lon]: number[]) {
  const ll = `${lon},${lat}`;
  return `https://yandex.ru/map-widget/v1/?ll=${ll}&z=16&pt=${ll},pm2rdm`;
}

// TODO: заказчик думает над переделкой блока.
export function Contacts({ site }: { site: Site }) {
  const [office, setOffice] = useState(0);
  // карта ловит колесо мыши — включаем её только по клику, чтобы не мешать прокрутке страницы
  const [active, setActive] = useState(false);
  const current = site.offices[office];

  return (
    <section className={styles.section} id="contacts">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow" aria-hidden />
            <h2 className="h2">Свяжитесь с нами удобным способом</h2>
          </div>
        </div>

        <div className={styles.cols}>
          <div className={styles.col}>
            <h3 className={styles.label}>Телефон</h3>
            <a href={telHref(site.phone)} className={styles.phone}>
              <span className={styles.link}>{site.phone}</span>
              <small>{site.phoneNote}</small>
            </a>
          </div>

          <div className={styles.col}>
            <h3 className={styles.label}>Адреса офисов</h3>
            {site.offices.map((o, i) => (
              <button
                key={o.address}
                type="button"
                className={styles.link}
                aria-pressed={i === office}
                onClick={() => {
                  setOffice(i);
                  setActive(false);
                  document.getElementById("office-map")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                {o.address}
              </button>
            ))}
            <h3 className={`${styles.label} ${styles.gap}`}>График работы</h3>
            <p className={styles.schedule}>
              {site.schedule.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </p>
          </div>

          <div className={styles.col}>
            <h3 className={styles.label}>Соц. сети</h3>
            <div className={styles.socials}>
              <a href={site.socials.vk} target="_blank" rel="noopener" aria-label="ВКонтакте">
                <img src={"/icons/soc-vk.svg"} alt="ВКонтакте" width={44} height={44} />
              </a>
              <a href={site.socials.telegram} target="_blank" rel="noopener" aria-label="Telegram-канал">
                <img src={"/icons/soc-tg.svg"} alt="Telegram" width={44} height={44} />
              </a>
              <a href={site.socials.maxChannel} target="_blank" rel="noopener" aria-label="Канал в MAX">
                <img src={"/icons/soc-max.svg"} alt="MAX" width={44} height={44} />
              </a>
            </div>
            <h3 className={`${styles.label} ${styles.gap}`}>Мессенджеры</h3>
            <div className={styles.socials}>
              <a href={site.socials.chat} target="_blank" rel="noopener" aria-label="Написать в Telegram">
                <img src={"/icons/soc-tg.svg"} alt="Telegram" width={44} height={44} />
              </a>
              <a href={site.socials.max} target="_blank" rel="noopener" aria-label="Написать в MAX">
                <img src={"/icons/soc-max.svg"} alt="MAX" width={44} height={44} />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.map} id="office-map" onMouseLeave={() => setActive(false)}>
        <iframe
          key={current.address}
          className={styles.mapFrame}
          src={mapUrl(current.coords)}
          title={`Карта: ${current.address}`}
          loading="lazy"
          allowFullScreen
        />
        {!active && (
          <button type="button" className={styles.mapShield} onClick={() => setActive(true)}>
            <span>
              <MousePointerClick size={18} />
              Нажмите, чтобы управлять картой
            </span>
          </button>
        )}
        <div className={styles.mapBadge}>
          <b>{current.city}</b>
          <span>{current.address}</span>
          <a href={telHref(site.phone)}>{site.phone}</a>
        </div>
      </div>
    </section>
  );
}
