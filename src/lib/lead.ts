"use client";

import { useRef, useState } from "react";
import { reachGoal } from "@/lib/metrika";

// Маска +7 (999) 999-99-99
export function formatPhone(input: string) {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (d && !d.startsWith("7")) d = "7" + d;
  d = d.slice(0, 11);
  if (!d) return "";
  const p = d.slice(1);
  let out = "+7";
  if (p.length) out += " (" + p.slice(0, 3);
  if (p.length >= 3) out += ")";
  if (p.length > 3) out += " " + p.slice(3, 6);
  if (p.length > 6) out += "-" + p.slice(6, 8);
  if (p.length > 8) out += "-" + p.slice(8, 10);
  return out;
}

export function isPhoneComplete(phone: string) {
  return phone.replace(/\D/g, "").length === 11;
}

// Варианты для поля «Как с вами связаться?» во всех формах
export const CONTACT_METHODS = ["Позвонить", "Telegram", "MAX", "WhatsApp"];

type Status = "idle" | "sending" | "done" | "error";


const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid", "gclid"];

// UTM с первой страницы визита — запоминаем на сессию, чтобы не потерять при переходах
function utm(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const saved = sessionStorage.getItem("utm");
    if (saved) Object.assign(out, JSON.parse(saved));
    const params = new URLSearchParams(location.search);
    const fresh = UTM_KEYS.filter((k) => params.get(k));
    if (fresh.length) {
      for (const k of UTM_KEYS) delete out[k];
      for (const k of fresh) out[k] = params.get(k)!;
      sessionStorage.setItem("utm", JSON.stringify(out));
    }
  } catch {}
  return out;
}

if (typeof window !== "undefined") utm();

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function useLeadSubmit(source: string) {
  const [status, setStatus] = useState<Status>("idle");
  // один ID на заявку: повторная отправка той же формы не создаёт дубль в amoCRM
  const submissionId = useRef<string>("");

  async function submit(fields: Record<string, string>) {
    setStatus("sending");
    submissionId.current ||= newId();
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          ...fields,
          submissionId: submissionId.current,
          pageUrl: location.href,
          referrer: document.referrer,
          utm: utm(),
        }),
      });
      setStatus(res.ok ? "done" : "error");
      if (res.ok) submissionId.current = "";
      reachGoal(res.ok ? "lead_submit" : "lead_error", { source });
    } catch {
      setStatus("error");
      reachGoal("lead_error", { source });
    }
  }

  return { status, submit, reset: () => setStatus("idle") };
}
