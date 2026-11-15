import { createHmac, timingSafeEqual } from "node:crypto";

// Проверка подписи initData Mini App: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// Без неё кто угодно мог бы слать заявки от имени любого пользователя.

export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };

export function verifyInitData(initData: string, botToken: string, maxAgeSec = 24 * 3600): TgUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try {
    return JSON.parse(params.get("user") ?? "null");
  } catch {
    return null;
  }
}
