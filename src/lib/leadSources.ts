// Откуда пришла заявка (source из форм) — человеческие названия.
const SOURCES: Record<string, string> = {
  header: "Шапка — «Заказать звонок»",
  "mobile-menu": "Мобильное меню — «Заказать звонок»",
  hero: "Первый экран — «Получить расчёт»",
  "how-we-work": "«Как мы работаем» — «Оставить заявку»",
  faq: "FAQ — «Задать вопрос»",
  "personal-selection": "Форма «Персональный подбор»",
  "catalog-empty": "Каталог — подбор под заказ",
  "price-decode": "Каталог — «Расшифровка цены»",
  "telegram-bot": "Telegram-бот",
  "telegram-miniapp": "Telegram Mini App",
};

// каталоги новых авто: источник «new-<рынок>:…» (src/lib/newCars.ts, leadSource)
const NEW_MARKETS: Record<string, string> = {
  china: "Новые авто из Китая (rangauto.ru/new/china)",
  uae: "Новые авто из ОАЭ (rangauto.ru/new/uae)",
};

export function sourceLabel(source: string) {
  if (SOURCES[source]) return SOURCES[source];
  if (source.startsWith("promo:")) return `Акция «${source.slice(6)}»`;
  const market = source.match(/^new-(china|uae):/);
  if (market) return `${NEW_MARKETS[market[1]]}: ${source.slice(market[0].length)}`;
  if (source.startsWith("new:")) return `Новые авто из Китая (rangauto.ru/new/china): ${source.slice(4)}`;
  if (source.startsWith("geo:")) return `География — консультация (${source.slice(4).toUpperCase()})`;
  return source || "—";
}
