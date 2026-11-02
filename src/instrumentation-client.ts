// Яндекс.Метрика. Файл выполняется в браузере до гидрации (конвенция Next instrumentation-client).
const YM_ID = 114003002;
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

// Клиентские переходы App Router не перезагружают страницу — отправляем хит вручную.
export function onRouterTransitionStart(url: string) {
  try {
    const to = new URL(url, location.href);
    if (to.pathname === location.pathname && to.search === location.search) return; // только якорь
    window.ym?.(YM_ID, "hit", to.href, { referer: location.href });
  } catch {}
}
