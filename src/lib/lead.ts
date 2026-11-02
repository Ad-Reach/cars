"use client";

import { useState } from "react";
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

type Status = "idle" | "sending" | "done" | "error";


export function useLeadSubmit(source: string) {
  const [status, setStatus] = useState<Status>("idle");

  async function submit(fields: Record<string, string>) {
    setStatus("sending");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, ...fields }),
      });
      setStatus(res.ok ? "done" : "error");
      reachGoal(res.ok ? "lead_submit" : "lead_error", { source });
    } catch {
      setStatus("error");
      reachGoal("lead_error", { source });
    }
  }

  return { status, submit, reset: () => setStatus("idle") };
}
