import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Api } from "grammy";
import { config } from "./config.js";
import { findOption } from "./quiz.js";
import { pickCars, COUNTRIES, catalogErrors } from "./catalog.js";
import { deliverLead } from "./lead.js";
import { T } from "./texts.js";
import { miniappHtml } from "./miniapp/render.js";
import { verifyInitData, type TgUser } from "./miniapp/auth.js";

// HTTP-сервер приложения:
//   GET  /            — Mini App (src/miniapp/index.html)
//   GET  /health      — проверка здоровья для App Platform
//   GET  /api/cars    — машины из каталога по ?b=бюджет&w=руль
//   POST /api/lead    — заявка из Mini App (подпись initData проверяется)

const json = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(body));

async function readBody(req: IncomingMessage, limit = 16_000) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const clean = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

async function handleLead(api: Api, req: IncomingMessage, res: ServerResponse) {
  const body = await readBody(req);
  let user: TgUser | null = verifyInitData(clean(body.initData, 4096), config.token);
  if (!user && config.miniappDev) user = { id: 0, first_name: "Тест" };
  if (!user) return json(res, 401, { ok: false, error: "auth" });

  const phone = clean(body.phone, 30);
  if (phone.replace(/\D/g, "").length < 10) return json(res, 422, { ok: false, error: "phone" });

  const answers: Record<string, string> = {};
  for (const [q, o] of Object.entries(body.answers ?? {})) if (findOption(q, String(o))) answers[q] = String(o);
  // машину ищем у себя (тот же кэш каталога), а не верим клиенту на слово
  const carUrl = clean(body.carUrl, 300);
  const car = carUrl ? (await pickCars(findOption("b", answers.b), findOption("w", answers.w))).find((c) => c.url === carUrl) : undefined;

  const name = clean(body.name, 100) || [user.first_name, user.last_name].filter(Boolean).join(" ");
  const ok = await deliverLead(api, {
    phone,
    name,
    user: { id: user.id, username: user.username },
    session: { answers, shown: [], car, comment: clean(body.comment) || undefined },
    source: "miniapp",
  });
  if (!ok && (config.leadChatIds.length || config.leadApiUrl || config.smtp.host)) return json(res, 502, { ok: false, error: "deliver" });
  if (user.id) await api.sendMessage(user.id, T.thanks).catch(() => {});
  json(res, 200, { ok: true });
}

async function handleCars(url: URL, res: ServerResponse) {
  const cars = await pickCars(findOption("b", url.searchParams.get("b") ?? ""), findOption("w", url.searchParams.get("w") ?? ""), 6);
  json(res, 200, {
    cars: cars.map((c) => ({ ...c, flag: COUNTRIES[c.country].flag, countryName: COUNTRIES[c.country].name })),
    // для отладки: какие страны каталога сейчас не загрузились и почему
    ...(catalogErrors.size ? { errors: Object.fromEntries(catalogErrors) } : {}),
  });
}

export function startServer(api: Api) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/health") return res.writeHead(200).end("ok");
      if (req.method === "GET" && url.pathname === "/") {
        return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }).end(miniappHtml);
      }
      if (req.method === "GET" && url.pathname === "/api/cars") return await handleCars(url, res);
      if (req.method === "POST" && url.pathname === "/api/lead") return await handleLead(api, req, res);
      res.writeHead(404).end();
    } catch (error) {
      console.error("[http]", req.method, url.pathname, error);
      if (!res.headersSent) json(res, 500, { ok: false });
    }
  });
  server.listen(config.port, "0.0.0.0", () => console.log(`HTTP :${config.port}${config.publicUrl ? ` · Mini App: ${config.publicUrl}/` : ""}`));
  return server;
}
