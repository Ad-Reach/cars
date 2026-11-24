import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import type { Api } from "grammy";
import { config } from "./config.js";
import { findOption, describe } from "./quiz.js";
import { pickCars, carById, photoFile, priceText, similarUrl, WHEEL_NAME } from "./catalog.js";
import { deliverLead } from "./lead.js";
import { T } from "./texts.js";
import { miniappHtml } from "./miniapp/render.js";
import { verifyInitData, type TgUser } from "./miniapp/auth.js";

// HTTP-сервер приложения:
//   GET  /            — Mini App (src/miniapp/index.html)
//   GET  /health      — проверка здоровья для App Platform
//   GET  /api/cars    — машины из таблицы по ?b=бюджет&w=руль
//   GET  /photos/<id>.jpg — фото машины
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
  // машину берём из своего каталога по id, а не верим клиенту на слово
  const car = carById(clean(body.carId, 80));

  const name = clean(body.name, 100) || [user.first_name, user.last_name].filter(Boolean).join(" ");
  const ok = await deliverLead(api, {
    phone,
    name,
    user: { id: user.id, username: user.username },
    rows: describe(answers).map(([k, v]) => [k, v]),
    car,
    comment: clean(body.comment) || undefined,
    source: "miniapp",
  });
  if (!ok && (config.leadChatIds.length || config.leadApiUrl || config.smtp.host)) return json(res, 502, { ok: false, error: "deliver" });
  if (user.id) await api.sendMessage(user.id, T.thanks).catch(() => {});
  json(res, 200, { ok: true });
}

function handleCars(url: URL, res: ServerResponse) {
  const cars = pickCars(findOption("b", url.searchParams.get("b") ?? ""), findOption("w", url.searchParams.get("w") ?? ""));
  json(res, 200, {
    cars: cars.map((c) => ({
      id: c.id,
      title: c.title,
      year: c.year,
      price: priceText(c),
      specs: c.specs,
      wheel: WHEEL_NAME[c.wheel],
      img: c.photo ? `photos/${c.id}.jpg` : "",
      similar: similarUrl(c),
    })),
  });
}

function handlePhoto(id: string, res: ServerResponse) {
  const car = /^[a-z0-9-]+$/.test(id) ? carById(id) : undefined;
  const file = car && photoFile(car);
  if (!file || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" });
  createReadStream(file).pipe(res);
}

export function startServer(api: Api) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/health") return res.writeHead(200).end("ok");
      if (req.method === "GET" && url.pathname === "/") {
        return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }).end(miniappHtml);
      }
      if (req.method === "GET" && url.pathname === "/api/cars") return handleCars(url, res);
      const photo = url.pathname.match(/^\/photos\/([a-z0-9-]+)\.jpg$/);
      if (req.method === "GET" && photo) return handlePhoto(photo[1], res);
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
