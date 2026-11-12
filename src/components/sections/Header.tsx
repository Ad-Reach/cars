"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Heart, MapPin, Menu, Search, X } from "lucide-react";
import { LeadButton } from "@/components/lead/LeadModal";
import { nav, telHref } from "@/data/site";
import type { Site } from "@/lib/content";
import styles from "./Header.module.css";

function Typewriter({ text, className }: { text: string; className: string }) {
  const [count, setCount] = useState(text.length);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      n = n >= text.length ? 0 : n + 1;
      setCount(n);
      timer = setTimeout(tick, n === text.length ? 6000 : n === 0 ? 400 : 45);
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <p className={className} aria-label={text}>
      <span aria-hidden>{text.slice(0, count)}</span>
      <span aria-hidden className={styles.caret} data-done={count === text.length || undefined} />
      <span aria-hidden className={styles.ghost}>{text.slice(count)}</span>
    </p>
  );
}

// base — адрес основного сайта для страниц на поддоменах: якоря «#…» ведут на rangauto.ru
export function Header({ site, base = "" }: { site: Site; base?: string }) {
  const abs = (href: string) => (base && href.startsWith("#") ? `${base}/${href}` : href);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 46);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className={styles.topbar}>
        <div className={`container ${styles.topbarInner}`}>
          <Typewriter className={styles.promo} text="Узнавайте первыми о новых поступлениях с выгодными ценами - в наших каналах" />
          <div className={styles.topLinks}>
            <a href={site.socials.telegram} target="_blank" rel="noopener" className={styles.topLink}>
              <img src={"/icons/soc-tg.svg"} alt="Telegram" width={18} height={18} className={styles.blink} />
              Telegram
            </a>
            <a href={site.socials.maxChannel} target="_blank" rel="noopener" className={styles.topLink}>
              <img src={"/icons/soc-max.svg"} alt="MAX" width={16} height={16} className={styles.blink} />
              MAX
            </a>
            <a href={telHref(site.phoneShort)} className={styles.topPhone}>
              {site.phoneShort}
            </a>
          </div>
        </div>
      </div>

      <header className={styles.header} data-scrolled={scrolled || undefined}>
        <div className={`container ${styles.inner}`}>
          <a href={base ? `${base}/` : "#top"} className={styles.logo} aria-label="Ранг Авто — на главную">
            <img src={"/icons/logo-dark.svg"} alt="Ранг Авто" width={200} height={40} />
          </a>

          <nav className={styles.nav} aria-label="Основное меню">
            {nav.map((item) => (
              <div key={item.label} className={styles.navItem}>
                <a href={abs(item.href)} className={styles.navLink}>
                  {item.label}
                  {item.children && <ChevronDown size={16} className={styles.chev} />}
                </a>
                {item.children && (
                  <div className={styles.dropdown}>
                    {item.children.map((c) =>
                      c.children ? (
                        <div key={c.label} className={styles.subItem}>
                          <a href={abs(c.href)} className={styles.subLink}>
                            {c.label}
                            <ChevronRight size={14} />
                          </a>
                          <div className={styles.submenu}>
                            {c.children.map((s) => (
                              <a key={s.label} href={abs(s.href)}>
                                {s.label}
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <a key={c.label} href={abs(c.href)}>
                          {c.label}
                        </a>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className={styles.actions}>
            {/* TODO: поиск и избранное — после появления каталога */}
            <a href={abs("#catalog")} className={styles.iconBtn}>
              <Search size={20} aria-hidden />
              <span className="visually-hidden">Поиск по каталогу</span>
            </a>
            <a href={abs("#catalog")} className={styles.iconBtn}>
              <Heart size={20} aria-hidden />
              <span className="visually-hidden">Избранное</span>
            </a>
            <LeadButton source="header" title="Заказать звонок" submitLabel="Жду звонка" className={`btn btn--gold ${styles.cta}`}>
              Заказать звонок
            </LeadButton>
            <button className={styles.burger} onClick={() => setOpen(true)} aria-label="Открыть меню">
              <Menu size={34} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </header>

      {/* боковое меню: затемнение страницы + панель справа */}
      <div
        className={styles.backdrop}
        data-open={open || undefined}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        className={styles.mobile}
        data-open={open || undefined}
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="Меню"
      >
        <div className={styles.mobileHead}>
          <img src={"/icons/logo-light.svg"} alt="Ранг Авто" width={160} height={36} />
          <button onClick={() => setOpen(false)} aria-label="Закрыть меню" className={styles.mobileClose}>
            <X size={28} />
          </button>
        </div>
        <nav className={styles.mobileNav} onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
          {nav.map((item) => (
            <div key={item.label}>
              <a href={abs(item.href)} className={styles.mobileLink}>
                {item.label}
              </a>
              {item.children?.map((c) => (
                <div key={c.label}>
                  <a href={abs(c.href)} className={styles.mobileSub}>
                    {c.label}
                  </a>
                  {c.children?.map((s) => (
                    <a key={s.label} href={abs(s.href)} className={styles.mobileSubSub}>
                      {s.label}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div className={styles.mobileFoot} onClick={(e) => (e.target as HTMLElement).closest("a[href^='#']") && setOpen(false)}>
          <a href={telHref(site.phone)} className={styles.mobilePhone}>
            {site.phone}
          </a>
          <ul className={styles.mobileContacts}>
            {site.offices.map((o) => (
              <li key={o.address}>
                <a href={abs("#contacts")}>
                  <MapPin size={18} />
                  {o.address}
                </a>
              </li>
            ))}
          </ul>
          <div className={styles.mobileSocials}>
            <a href={site.socials.telegram} target="_blank" rel="noopener" aria-label="Telegram">
              <img src={"/icons/soc-tg.svg"} alt="Telegram" width={40} height={40} />
            </a>
            <a href={site.socials.maxChannel} target="_blank" rel="noopener" aria-label="Канал в MAX">
              <img src={"/icons/soc-max.svg"} alt="MAX" width={40} height={40} />
            </a>
            <a href={site.socials.vk} target="_blank" rel="noopener" aria-label="ВКонтакте">
              <img src={"/icons/soc-vk.svg"} alt="ВКонтакте" width={40} height={40} />
            </a>
          </div>
          <LeadButton source="mobile-menu" title="Заказать звонок" submitLabel="Жду звонка" className="btn btn--gold">
            Заказать звонок
          </LeadButton>
        </div>
      </div>
    </>
  );
}
