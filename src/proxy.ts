import { NextResponse, type NextRequest } from "next/server";
import { NEW_CARS_PUBLIC } from "@/lib/newCarsFlag";

// Каталог новых авто в тестовом режиме: /new открывается только по ссылке /new?preview=<ключ>.
// Ключ — переменная NEW_CARS_PREVIEW_KEY (задаётся в Ad-Reach/infra), после первого входа запоминается в cookie.
const COOKIE = "new_preview";

// Серверных действий (Server Actions) на сайте нет: формы работают через /api.
// Боты-сканеры шлют POST с заголовком Next-Action — отвечаем 404, не доводя запрос до Next.js
// (иначе в логах ошибки «Server Reference ID…» и «Unexpected cache miss…» на «/»).
const notFound = () =>
  new NextResponse("Страница не найдена", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export function proxy(request: NextRequest) {
  if (request.headers.has("next-action")) return notFound();
  if (NEW_CARS_PUBLIC) return NextResponse.next();
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
    const res = NextResponse.next();
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
