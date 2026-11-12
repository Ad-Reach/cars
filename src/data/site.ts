// Контакты и реквизиты. Позже эти данные будут редактироваться из админки.
export const site = {
  name: "Ранг Авто",
  legalName: "ООО «Ранг Авто»",
  inn: "3000026854",
  ogrn: "1263000003573",
  // один многоканальный номер на оба офиса
  phone: "+7 (937) 505-55-88",
  phoneNote: "Многоканальный номер — Краснодар и Астрахань",
  phoneShort: "8 (937) 505-55-88",
  email: "rangauto@mail.ru",
  // coords: [широта, долгота] — для карты в блоке контактов
  offices: [
    { city: "Краснодар", address: "Краснодар, ул. Западный Обход, 29", coords: [45.080338, 38.893745] },
    { city: "Астрахань", address: "Астрахань, Славянская 1л", coords: [46.359931, 48.096326] },
  ],
  schedule: ["Пн - Пт - с 9:00 до 18:00", "Сб - Вс - с 10:00 до 17:00"],
  socials: {
    telegram: "https://t.me/rangauto",
    chat: "https://t.me/RangAuto_Global",
    max: "https://max.ru/+79375055588",
    maxChannel: "https://max.ru/join/nvq-cNE2TSXd9-uUWehTleUlcdbpMcZ4pPuWyeBvlCQ",
    vk: "https://vk.ru/rangauto",
  },
};

export function telHref(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^8/, "7");
  return `tel:+${digits}`;
}

const CATALOG = "https://catalog.rangauto.ru";

export const catalogUrls = {
  home: `${CATALOG}/`,
  jpNew: `${CATALOG}/catalog/`,
  calculator: `${CATALOG}/calculator/`,
  cn: `${CATALOG}/china-used/`,
  kr: `${CATALOG}/korea/`,
  jp: `${CATALOG}/statistika/`,
};

export type NavLink = { label: string; href: string; children?: NavLink[] };

export const japanCatalogLinks: NavLink[] = [
  { label: "Аукционы Японии", href: `${CATALOG}/auktsiony/` },
  { label: "Статистика продаж", href: `${CATALOG}/statistika/` },
  { label: "Новые авто из Японии", href: catalogUrls.jpNew },
  { label: "Комплектации авто Японии", href: `${CATALOG}/katalog-komplektatsiy/` },
  { label: "Как читать аукционный лист", href: `${CATALOG}/catalog/kak-chitat-auktsionnyy-list/` },
];

export const nav: NavLink[] = [
  {
    label: "Каталог",
    href: "#catalog",
    children: [
      { label: "Новые авто из Китая", href: "https://new.rangauto.ru/" },
      { label: "Авто из Китая", href: catalogUrls.cn },
      { label: "Авто из Кореи", href: catalogUrls.kr },
      {
        label: "Авто из Японии",
        href: catalogUrls.jp,
        children: japanCatalogLinks,
      },
    ],
  },
  { label: "Калькулятор", href: catalogUrls.calculator },
  {
    label: "О компании",
    href: "#how",
    children: [
      { label: "Как мы работаем", href: "#how" },
      { label: "Отзывы", href: "#reviews" },
      { label: "Вопросы и ответы", href: "#faq" },
      { label: "Блог", href: "#news" },
    ],
  },
  { label: "Контакты", href: "#contacts" },
];
