import { NextResponse, type NextRequest } from "next/server";

// new.rangauto.ru — каталог новых авто из Китая. Страницы лежат в src/app/new
// и отдаются на поддомене без префикса: «/» → /new, «/<модель>» → /new/<модель>.
const NEW_HOST = "new.rangauto.ru";

export function proxy(request: NextRequest) {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0];
  if (host !== NEW_HOST) return NextResponse.next();

  const { pathname } = request.nextUrl;
  // proxy вызывается и для уже переписанного запроса — его не трогаем
  if (pathname === "/new" || pathname.startsWith("/new/")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/new" : `/new${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // всё, кроме служебного, API и файлов (кроме sitemap.xml и robots.txt)
  matcher: ["/", "/sitemap.xml", "/robots.txt", "/((?!_next|api|new-cars|icons|img|.*\\..*).*)"],
};
