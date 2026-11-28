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

/** Машина, по которой оставлена заявка (карточки каталога новых авто) — уходит в CRM. */
export type LeadVehicle = { name: string; url?: string; brand?: string; model?: string };

// UTM-метки первого захода: запоминаются на вкладку (src/instrumentation-client.ts), уходят с каждой заявкой
const UTM_KEY = "rangauto_utm";
const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid", "gclid"];

export function rememberUtm() {
  try {
    const q = new URLSearchParams(location.search);
    const utm = Object.fromEntries(UTM_PARAMS.map((k) => [k, q.get(k) ?? ""]).filter(([, v]) => v));
    if (Object.keys(utm).length) sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
  } catch {}
}

function readUtm(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(UTM_KEY) ?? "{}");
  } catch {
    return {};
  }
}

const newSubmissionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export function useLeadSubmit(source: string, vehicle?: LeadVehicle) {
  const [status, setStatus] = useState<Status>("idle");
  // Один submission_id на одну заявку: повтор после ошибки с теми же данными — та же заявка,
  // сервер не создаст второй сделки и не продублирует сообщения
  const attempt = useRef<{ key: string; id: string } | null>(null);

  async function submit(fields: Record<string, string>) {
    setStatus("sending");
    const key = JSON.stringify([source, fields, vehicle ?? null]);
    if (attempt.current?.key !== key) attempt.current = { key, id: newSubmissionId() };
    const submission_id = attempt.current.id;
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, ...fields, submission_id, page_url: location.href, utm: readUtm(), vehicle }),
      });
      setStatus(res.ok ? "done" : "error");
      if (res.ok) attempt.current = null;
      reachGoal(res.ok ? "lead_submit" : "lead_error", { source });
    } catch {
      setStatus("error");
      reachGoal("lead_error", { source });
    }
  }

  return { status, submit, reset: () => setStatus("idle") };
}
