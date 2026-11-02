"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { CONTACT_METHODS, formatPhone, isPhoneComplete, useLeadSubmit } from "@/lib/lead";
import { reachGoal } from "@/lib/metrika";
import styles from "./LeadModal.module.css";

type LeadOptions = {
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  // Откуда пришла заявка — попадёт в CRM/админку
  source: string;
};

const DEFAULTS = {
  title: "Получить расчёт под ключ",
  // TODO: финальные тексты и поля формы — от заказчика
  subtitle: "Оставьте контакты — менеджер свяжется с вами в течение 15 минут и рассчитает стоимость автомобиля.",
  submitLabel: "Отправить заявку",
};

const LeadContext = createContext<(opts: LeadOptions) => void>(() => {});

export function useLeadModal() {
  return useContext(LeadContext);
}

export function LeadModalProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<LeadOptions | null>(null);
  const open = useCallback((o: LeadOptions) => {
    reachGoal("lead_form_open", { source: o.source });
    setOpts(o);
  }, []);

  return (
    <LeadContext.Provider value={open}>
      {children}
      {opts && <LeadDialog opts={opts} onClose={() => setOpts(null)} />}
    </LeadContext.Provider>
  );
}

function LeadDialog({ opts, onClose }: { opts: LeadOptions; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { status, submit } = useLeadSubmit(opts.source);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState(false);

  useEffect(() => {
    const dlg = dialogRef.current;
    dlg?.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isPhoneComplete(phone)) {
      setPhoneError(true);
      return;
    }
    const fd = new FormData(e.currentTarget);
    submit({
      name: String(fd.get("name") ?? ""),
      phone,
      contact: String(fd.get("contact") ?? ""),
      comment: String(fd.get("comment") ?? ""),
      topic: opts.title ?? DEFAULTS.title,
      website: String(fd.get("website") ?? ""),
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className={styles.panel}>
        <button className={styles.close} onClick={() => dialogRef.current?.close()} aria-label="Закрыть">
          <X size={22} />
        </button>
        <div className={styles.stripes} aria-hidden />

        {status === "done" ? (
          <div className={styles.done}>
            <h2 className={styles.title}>Заявка отправлена</h2>
            <p className={styles.subtitle}>Спасибо! Менеджер свяжется с вами в ближайшее время.</p>
            <button className="btn btn--gold" onClick={() => dialogRef.current?.close()}>
              Хорошо
            </button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hp-field" />
            <h2 className={styles.title}>{opts.title ?? DEFAULTS.title}</h2>
            <p className={styles.subtitle}>{opts.subtitle ?? DEFAULTS.subtitle}</p>

            <label className={styles.field}>
              <span className="visually-hidden">Ваше имя</span>
              <input name="name" placeholder="Ваше имя" autoComplete="name" />
            </label>
            <label className={styles.field} data-error={phoneError || undefined}>
              <span className="visually-hidden">Телефон</span>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 (999) 999-99-99"
                value={phone}
                onChange={(e) => {
                  setPhone(formatPhone(e.target.value));
                  setPhoneError(false);
                }}
                required
              />
            </label>
            {phoneError && <p className={styles.error}>Введите номер телефона полностью</p>}
            <label className={styles.field}>
              <span className="visually-hidden">Как с вами связаться?</span>
              <select name="contact" defaultValue="">
                <option value="" disabled>
                  Как с вами связаться?
                </option>
                {CONTACT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className="visually-hidden">Комментарий</span>
              <textarea name="comment" placeholder="Марка, модель, бюджет — по желанию" rows={3} />
            </label>

            <button className={`btn btn--gold ${styles.submit}`} disabled={status === "sending"}>
              {status === "sending" ? "Отправляем…" : (opts.submitLabel ?? DEFAULTS.submitLabel)}
            </button>
            {status === "error" && <p className={styles.error}>Не удалось отправить. Попробуйте ещё раз или позвоните нам.</p>}

            <label className={styles.consent}>
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
    </dialog>
  );
}

// Кнопка, открывающая попап. Можно использовать в серверных компонентах.
export function LeadButton({
  children,
  className,
  ...opts
}: LeadOptions & { children: ReactNode; className?: string }) {
  const open = useLeadModal();
  return (
    <button type="button" className={className} onClick={() => open(opts)}>
      {children}
    </button>
  );
}
