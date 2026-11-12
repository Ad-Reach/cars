import { LeadButton } from "@/components/lead/LeadModal";
import Link from "next/link";
import { carImg, carSrcSet, fullName, newCars, NEW_PATH, NEW_URL, rub, type NewCarModel } from "@/lib/newCars";
import { SITE_URL } from "@/lib/seo";
import { Gallery, Trims } from "./ModelParts";
import { NewCarCard } from "./NewCatalog";
import styles from "./NewCars.module.css";

export function NewCarPage({ car }: { car: NewCarModel }) {
  const title = fullName(car);
  const cover = car.gallery[0]?.img;
  const similar = car.similar
    .map((s) => newCars.find((c) => c.slug === s))
    .filter(Boolean) as typeof newCars;

  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "Car",
      name: `${title} из Китая`,
      description: car.description,
      brand: { "@type": "Brand", name: car.brand },
      model: car.model,
      vehicleModelDate: car.year,
      bodyType: car.bodyType,
      vehicleTransmission: car.transmission,
      fuelType: car.fuelType,
      image: car.gallery.slice(0, 5).map((g) => SITE_URL + carImg(car.slug, g.img, "w1160")),
      url: `${NEW_URL}/${car.slug}`,
      ...(car.price
        ? { offers: { "@type": "Offer", priceCurrency: "RUB", price: car.price, availability: "https://schema.org/PreOrder" } }
        : {}),
    },
    ...(car.faq.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: car.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
        ]
      : []),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Ранг Авто", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Новые авто из Китая", item: NEW_URL },
        { "@type": "ListItem", position: 3, name: title },
      ],
    },
  ];

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      {/* обложка */}
      <section className={styles.cover}>
        {cover && (
          <img
            className={styles.coverBg}
            src={carImg(car.slug, cover, "w1160")}
            srcSet={carSrcSet(car.slug, cover)}
            sizes="100vw"
            alt=""
            aria-hidden
          />
        )}
        <div className={`container ${styles.coverIn}`}>
          <nav className={styles.crumbs} aria-label="Хлебные крошки">
            <Link href="/">Главная</Link>
            <span>/</span>
            <Link href={NEW_PATH}>Новые авто из Китая</Link>
            <span>/</span>
            <b>{title}</b>
          </nav>
          {car.tag && <span className={styles.coverTag}>{car.tag}</span>}
          <h1 className={styles.coverH1}>
            {car.name} <em>{car.year}</em>
          </h1>
          <p className={styles.coverPrice}>
            <b>{car.price ? `от ${rub(car.price)}` : "Цена по запросу"}</b>
            <span>под ключ — доставка, таможенные платежи и утилизационный сбор включены</span>
          </p>
          {car.lead && <p className={styles.coverLead}>{car.lead}</p>}
          <div className={styles.coverCta}>
            <LeadButton source={`new:${title}`} title={`Заявка на ${title}`} className="btn btn--gold">
              Оставить заявку
            </LeadButton>
            <a href="#prices" className="btn btn--ghost-light">
              Цены и комплектации
            </a>
          </div>
        </div>
      </section>

      {car.ribbon.length > 0 && (
        <div className={styles.ribbon}>
          <div className="container">
            <dl className={styles.ribbonIn}>
              {car.ribbon.map((r) => (
                <div key={r.label}>
                  <dt>{r.value}</dt>
                  <dd>{r.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {/* галерея */}
      <section className="section section--white">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow" aria-hidden />
              <h2 className="h2">Знакомство с {car.name}</h2>
              {car.galleryIntro && <p className={`section-sub ${styles.sub}`}>{car.galleryIntro}</p>}
            </div>
          </div>
          <Gallery car={car} title={title} />
        </div>
      </section>

      {/* главы: дизайн, комфорт, техника */}
      {car.chapters.map((ch, k) => (
        <section key={ch.eyebrow + k} className={`section ${ch.dark ? "section--dark" : "section--light"}`}>
          <div className={`container ${styles.chapter}`} data-rev={k % 2 === 1 || undefined}>
            {ch.img && (
              <div className={styles.chapterPh}>
                <img
                  src={carImg(car.slug, ch.img, "w1160")}
                  srcSet={carSrcSet(car.slug, ch.img)}
                  sizes="(max-width: 900px) 100vw, 50vw"
                  alt={ch.alt}
                  loading="lazy"
                  width={1160}
                  height={773}
                />
              </div>
            )}
            <div className={styles.chapterText}>
              <span className="eyebrow" aria-hidden />
              <p className={styles.chapterKicker}>{ch.eyebrow}</p>
              <h2 className="h2">
                {ch.title} <span className={styles.accent}>{ch.accent}</span>
              </h2>
              <p>{ch.text}</p>
            </div>
          </div>
        </section>
      ))}

      {/* цены и комплектации */}
      <section className="section section--dark" id="prices">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow" aria-hidden />
              <h2 className="h2">Цены под ключ</h2>
              <p className={`section-sub ${styles.subDark}`}>
                В цену входят доставка, таможенное оформление, утилизационный сбор и все платежи.
              </p>
            </div>
          </div>
          <Trims car={car} title={title} />
        </div>
      </section>

      {/* характеристики */}
      {car.specs.length > 0 && (
        <section className="section section--white">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow" aria-hidden />
                <h2 className="h2">Технические характеристики</h2>
              </div>
            </div>
            <dl className={styles.specs}>
              {car.specs.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      {/* вопросы */}
      {car.faq.length > 0 && (
        <section className="section section--light">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow" aria-hidden />
                <h2 className="h2">Вопросы про {car.name}</h2>
              </div>
            </div>
            <div className={styles.faq}>
              {car.faq.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* заявка */}
      <section className={`section section--dark ${styles.leadBand}`}>
        <div className={`container ${styles.leadBandIn}`}>
          <div>
            <span className="eyebrow" aria-hidden />
            <h2 className="h2">Закажите {car.name} из Китая</h2>
            <p className={`section-sub ${styles.subDark}`}>
              Рассчитаем цену под ключ в вашем городе, подберём комплектацию и цвет. Перезвоним в течение 15 минут.
            </p>
          </div>
          <LeadButton source={`new:${title} · низ страницы`} title={`Заявка на ${title}`} className="btn btn--gold">
            Получить расчёт
          </LeadButton>
        </div>
      </section>

      {similar.length > 0 && (
        <section className="section section--light">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow" aria-hidden />
                <h2 className="h2">Похожие модели</h2>
              </div>
              <Link href={NEW_PATH} className="btn btn--outline">
                Все модели
              </Link>
            </div>
            <div className={styles.grid}>
              {similar.slice(0, 4).map((c) => (
                <NewCarCard key={c.slug} car={c} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
