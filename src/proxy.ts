import { NextResponse, type NextRequest } from "next/server";
import { NEW_CARS_PUBLIC } from "@/lib/newCarsFlag";

// Каталоги новых авто (/new, /new/china, /new/uae) в тестовом режиме открываются только по ссылке
// с ключом: /new/uae?preview=<ключ> (подходит любой адрес внутри /new).
// Ключ — переменная NEW_CARS_PREVIEW_KEY (задаётся в Ad-Reach/infra), после первого входа запоминается
// в cookie на весь /new, так что дальше ходить по каталогам можно без ключа.
const COOKIE = "new_preview";

// Рынки каталога — как в src/lib/newCars.ts (сюда не импортируем: там подтягиваются JSON каталога).
const MARKETS = new Set(["china", "uae"]);

// Адреса каталога: /new, /new/<рынок>, /new/<рынок>/<модель>.
// Старые адреса моделей /new/<модель> (до разделения по рынкам) → /new/china/<модель>;
// неизвестный рынок во вложенном адресе — сразу 404.
function route(request: NextRequest) {
  const [, , market, ...rest] = request.nextUrl.pathname.replace(/\/$/, "").split("/");
  if (!market || MARKETS.has(market)) return NextResponse.next();
  if (rest.length || !/^[a-z0-9-]+$/.test(market)) return notFound();
  const url = request.nextUrl.clone();
  url.pathname = `/new/china/${market}`;
  return NextResponse.redirect(url, 308);
}

// Серверных действий (Server Actions) на сайте нет: формы работают через /api.
// Боты-сканеры шлют POST с заголовком Next-Action — отвечаем 404, не доводя запрос до Next.js
// (иначе в логах ошибки «Server Reference ID…» и «Unexpected cache miss…» на «/»).
const notFound = () =>
  new NextResponse("Страница не найдена", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export function proxy(request: NextRequest) {
  if (request.headers.has("next-action")) return notFound();
  if (NEW_CARS_PUBLIC) return route(request);
  const key = process.env.NEW_CARS_PREVIEW_KEY;
  const url = request.nextUrl;

  if (key && url.searchParams.get("preview") === key) {
    const clean = url.clone();
    clean.searchParams.delete("preview");
    const res = NextResponse.redirect(clean);
    res.cookies.set(COOKIE, key, { path: "/new", httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
    return res;
  }
  if (key && request.cookies.get(COOKIE)?.value === key) {
    const res = route(request);
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }
  return notFound();
}

export const config = {
  matcher: [
    "/new",
    "/new/:path*",
    { source: "/((?!_next/static|_next/image).*)", has: [{ type: "header", key: "next-action" }] },
  ],
};
