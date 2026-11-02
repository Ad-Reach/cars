// Яндекс.Метрика. Файл выполняется в браузере до гидрации (конвенция Next instrumentation-client).
import { YM_ID, reachGoal } from "@/lib/metrika";

const YM_SRC = `https://mc.yandex.ru/metrika/tag.js?id=${YM_ID}`;

type Ym = ((id: number, method: string, ...args: unknown[]) => void) & { a?: unknown[]; l?: number };

declare global {
  interface Window {
    ym?: Ym;
  }
}

try {
  if (!window.ym) {
    const ym: Ym = (...args) => {
      (ym.a = ym.a || []).push(args);
    };
    ym.l = Date.now();
    window.ym = ym;
  }
  if (!Array.from(document.scripts).some((s) => s.src === YM_SRC)) {
    const s = document.createElement("script");
    s.async = true;
    s.src = YM_SRC;
    document.head.appendChild(s);
  }

  window.ym(YM_ID, "init", {
    ssr: true,
    webvisor: true,
    clickmap: true,
    ecommerce: "dataLayer",
    referrer: document.referrer,
    url: location.href,
    accurateTrackBounce: true,
    trackLinks: true,
  });
} catch {
  // Метрика не должна ломать сайт.
}

// Клики по контактам — одним делегированным обработчиком, чтобы не трогать каждую ссылку.
document.addEventListener(
  "click",
  (e) => {
    const a = (e.target as Element | null)?.closest?.("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("tel:")) reachGoal("phone_click");
    else if (href.startsWith("mailto:")) reachGoal("email_click");
    else {
      const m = href.match(/^https?:\/\/(t\.me|max\.ru|vk\.(?:ru|com))\//);
      if (m) reachGoal("messenger_click", { messenger: m[1] });
      else if (href.startsWith("https://catalog.rangauto.ru")) reachGoal("catalog_click", { url: href });
    }
  },
  { capture: true },
);

// Клиентские переходы App Router не перезагружают страницу — отправляем хит вручную.
export function onRouterTransitionStart(url: string) {
  try {
    const to = new URL(url, location.href);
    if (to.pathname === location.pathname && to.search === location.search) return; // только якорь
    window.ym?.(YM_ID, "hit", to.href, { referer: location.href });
  } catch {}
}
