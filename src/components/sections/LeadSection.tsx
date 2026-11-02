"use client";

import Link from "next/link";
import { useState } from "react";
import { CONTACT_METHODS, formatPhone, isPhoneComplete, useLeadSubmit } from "@/lib/lead";
import type { Site } from "@/lib/cms";
import styles from "./LeadSection.module.css";

export function LeadSection({ site }: { site: Site }) {
  const { status, submit } = useLeadSubmit("personal-selection");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isPhoneComplete(phone)) {
      setPhoneError(true);
      return;
    }
    const fd = new FormData(e.currentTarget);
    const fields: Record<string, string> = {};
    fd.forEach((v, k) => (fields[k] = String(v)));
    submit({ ...fields, phone });
  }

  return (
    <section className={styles.section} id="lead">
      <div className="container">
        <div className={styles.card}>
          <div className={styles.info}>
            <span className="eyebrow" aria-hidden />
            <h2 className="h2">
              Найдём автомобиль <br />
              под ваш бюджет
            </h2>
            <p className={styles.text}>
              Подберём подходящие автомобили из Китая, Кореи и Японии, сравним предложения и рассчитаем полную стоимость
            </p>
            <p className={styles.small}>
              Или свяжитесь с нами в{" "}
              <a href={site.socials.chat} target="_blank" rel="noopener">
                Telegram
              </a>{" "}
              или{" "}
              <a href={site.socials.max} target="_blank" rel="noopener">
                MAX
              </a>
            </p>
          </div>

          <div className={styles.formWrap}>
            {status === "done" ? (
              <div className={styles.done}>
                <h3>Заявка отправлена</h3>
                <p>Спасибо! Менеджер свяжется с вами и пришлёт подборку автомобилей.</p>
              </div>
            ) : (
              <form className={styles.form} onSubmit={onSubmit} noValidate>
                <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hp-field" />
                <input className={styles.wide} name="name" placeholder="Ваше имя" autoComplete="name" aria-label="Ваше имя" />
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+7 (999) 999-99-99"
                  aria-label="Телефон"
                  value={phone}
                  data-error={phoneError || undefined}
                  onChange={(e) => {
                    setPhone(formatPhone(e.target.value));
                    setPhoneError(false);
                  }}
                />
                <input name="budget" placeholder="Бюджет" aria-label="Бюджет" />
                <input name="city" placeholder="Город" autoComplete="address-level2" aria-label="Город" />
                <select name="contact" defaultValue="" aria-label="Как с вами связаться?">
                  <option value="" disabled>
                    Как с вами связаться?
                  </option>
                  {CONTACT_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <input
                  className={styles.wide}
                  name="wishes"
                  placeholder="Пожелания: марка, модель"
                  aria-label="Пожелания к автомобилю"
                />
                {phoneError && <p className={`${styles.wide} ${styles.error}`}>Введите номер телефона полностью</p>}
                <button className={`btn btn--gold ${styles.wide} ${styles.submit}`} disabled={status === "sending"}>
                  {status === "sending" ? "Отправляем…" : "Получить подборку автомобилей"}
                </button>
                {status === "error" && (
                  <p className={`${styles.wide} ${styles.error}`}>Не удалось отправить. Попробуйте ещё раз.</p>
                )}
                <label className={`${styles.wide} ${styles.consent}`}>
                  <input type="checkbox" required defaultChecked />
                  <span>
                    Отправляя форму, вы соглашаетесь с{" "}
                    <Link href="/privacy" target="_blank">
                      политикой обработки персональных данных
                    </Link>
                  </span>
                </label>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
