import Link from "next/link";
import { ArrowRight, MapPin, Phone } from "lucide-react";
import { catalogUrls, telHref } from "@/data/site";
import type { Site } from "@/lib/content";
import styles from "./Footer.module.css";

const catalogLinks = [
  { label: "Авто из Китая", href: catalogUrls.cn },
  { label: "Авто из Кореи", href: catalogUrls.kr },
  { label: "Авто из Японии", href: catalogUrls.jp },
];

const companyLinks = [
  { label: "О компании", href: "#how" },
  { label: "Гарантии", href: "#why" },
  { label: "Как купить", href: "#how" },
  { label: "Доставка авто", href: "#geo" },
  { label: "Отзывы", href: "#reviews" },
  { label: "Блог", href: "#news" },
  { label: "Вопросы и ответы", href: "#faq" },
  { label: "Контакты", href: "#contacts" },
];

export function Footer({ site, base = "" }: { site: Site; base?: string }) {
  const abs = (href: string) => (base && href.startsWith("#") ? `${base}/${href}` : href);
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.grid}`}>
        <div className={styles.about}>
          <img src={"/icons/logo-light.svg"} alt="Ранг Авто" width={200} height={45} />
          <p className={styles.desc}>
            Импорт автомобилей из Китая, Кореи и Японии с 2018 года. Помогаем выбрать, купить и доставить автомобиль
          </p>
          <dl className={styles.req}>
            <div>
              <dt>ООО</dt>
              <dd>«РАНГ АВТО»</dd>
            </div>
            <div>
              <dt>ИНН</dt>
              <dd>{site.inn}</dd>
            </div>
            <div>
              <dt>ОГРН</dt>
              <dd>{site.ogrn}</dd>
            </div>
          </dl>
          <div className={styles.socials}>
            <a href={site.socials.vk} target="_blank" rel="noopener" aria-label="ВКонтакте">
              <img src={"/icons/soc-vk.svg"} alt="ВКонтакте" width={30} height={30} />
            </a>
            <a href={site.socials.telegram} target="_blank" rel="noopener" aria-label="Telegram">
              <img src={"/icons/soc-tg.svg"} alt="Telegram" width={30} height={30} />
            </a>
            <a href={site.socials.maxChannel} target="_blank" rel="noopener" aria-label="Канал в MAX">
              <img src={"/icons/soc-max.svg"} alt="MAX" width={30} height={30} />
            </a>
          </div>
        </div>

        <nav className={styles.col} aria-label="Каталог автомобилей">
          <h3 className={styles.title}>
            <a href={catalogUrls.home}>Каталог автомобилей</a>
          </h3>
          {catalogLinks.map((l) => (
            <a key={l.label} href={abs(l.href)}>
              {l.label}
            </a>
          ))}
        </nav>

        <nav className={styles.col} aria-label="Компания">
          <h3 className={styles.title}>Компания</h3>
          {companyLinks.map((l) => (
            <a key={l.label} href={abs(l.href)}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className={styles.col}>
          <h3 className={styles.title}>Контакты</h3>
          <a href={telHref(site.phone)} className={styles.contact}>
            <span className={styles.ci}>
              <Phone size={16} />
            </span>
            <span>
              {site.phone}
              <small>{site.phoneNote}</small>
            </span>
          </a>
          {site.offices.map((office) => (
            <a key={office.address} href={abs("#contacts")} className={styles.contact}>
              <span className={styles.ci}>
                <MapPin size={16} />
              </span>
              <span>
                <u>{office.address}</u>
                <small>Офис в г. {office.city}</small>
              </span>
            </a>
          ))}
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={`container ${styles.bottomInner}`}>
          <span>© 2026 Ранг Авто</span>
          <Link href={`${base}/agreement`}>
            Пользовательское соглашение <ArrowRight size={14} />
          </Link>
          <Link href={`${base}/privacy`}>
            Политика конфиденциальности <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </footer>
  );
}
