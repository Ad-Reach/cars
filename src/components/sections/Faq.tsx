"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, Clock, UserRound, VolumeX } from "lucide-react";
import { useLeadModal } from "@/components/lead/LeadModal";
import { Icon } from "@/components/ui/Icon";
import type { FaqCategory, FaqItem, FaqKey } from "@/data/content";
import type { Site } from "@/lib/content";
import { Markdown } from "@/components/ui/Markdown";
import styles from "./Faq.module.css";

export function Faq({
  faq,
  faqCategories,
  site,
}: {
  faq: Record<FaqKey, FaqItem[]>;
  faqCategories: FaqCategory[];
  site: Site;
}) {
  const [cat, setCat] = useState<FaqKey>("general");
  const [open, setOpen] = useState<number | null>(null);
  const openLead = useLeadModal();

  return (
    <section className="section section--dark" id="faq">
      <div className="container">
        <span className="eyebrow" aria-hidden />
        <h2 className="h2">Всё, что вы хотели знать об импорте авто</h2>

        <div className={styles.tabs} role="tablist" aria-label="Разделы вопросов">
          {faqCategories.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={cat === c.id}
              className={styles.tab}
              onClick={() => {
                setCat(c.id);
                setOpen(null);
              }}
            >
              <Icon name={c.icon} size={16} />
              {c.label}
            </button>
          ))}
        </div>

        <ul className={styles.list} key={cat} role="tabpanel">
          {faq[cat].map((item, i) => {
            const isOpen = open === i;
            return (
              <li key={item.q} className={styles.item} data-open={isOpen || undefined} style={{ animationDelay: `${i * 50}ms` }}>
                <button
                  className={styles.q}
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span>{item.q}</span>
                  <ChevronDown size={26} className={styles.chev} />
                </button>
                <div className={styles.a}>
                  <div>
                    <div className={styles.answer}>
                      <Markdown text={item.a} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className={styles.cta}>
          <span className={styles.stripes} aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <div className={styles.ctaMain}>
            <h3>Не нашли ответ?</h3>
            <p>Наши специалисты ответят на ваши вопросы и помогут разобраться во всех деталях покупки автомобиля</p>
            <div className={styles.ctaBtns}>
              <button
                className={`btn btn--outline ${styles.ask}`}
                onClick={() => openLead({ source: "faq", title: "Задать вопрос", submitLabel: "Задать вопрос" })}
              >
                Задать вопрос <ArrowRight size={14} />
              </button>
              <a href={site.socials.chat} target="_blank" rel="noopener" className={`${styles.msg} ${styles.tg}`} aria-label="Telegram">
                <img src={"/icons/glyph-tg.svg"} alt="Telegram" width={21} height={17} />
              </a>
              <a href={site.socials.max} target="_blank" rel="noopener" className={`${styles.msg} ${styles.max}`} aria-label="MAX">
                <img src={"/icons/glyph-max.svg"} alt="MAX" width={17} height={17} />
              </a>
            </div>
          </div>
          <ul className={styles.perks}>
            <li>
              <span><Clock size={16} /></span>Ответим в течение 15 минут
            </li>
            <li>
              <span><UserRound size={16} /></span>Персональный менеджер 24/7
            </li>
            <li>
              <span><VolumeX size={16} /></span>Без навязчивых звонков
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
