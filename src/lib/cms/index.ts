import type { IconName } from "@/components/ui/Icon";
import * as local from "@/data/content";
import { news as localNews, type Article } from "@/data/news";
import { site as localSite } from "@/data/site";
import { cmsFetch } from "@/lib/cms/cmsFetch";

type Media = { url: string } | null | undefined;
type Entry = Record<string, unknown>;
type Line = { text: string };

export type Site = typeof localSite;

export type SiteContent = {
  site: Site;
  heroStats: local.HeroStat[];
  workSteps: local.WorkStep[];
  promos: local.Promo[];
  geography: local.CountryInfo[];
  reasons: local.Reason[];
  reviews: local.Review[];
  banks: local.Partner[];
  cars: local.Car[];
  faqCategories: local.FaqCategory[];
  faq: Record<local.FaqKey, local.FaqItem[]>;
  news: Article[];
};

const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${months[m - 1]} ${y}`;
}

function mediaUrl(m: Media) {
  if (!m?.url) return "";
  return /^https?:/.test(m.url) ? m.url : `${process.env.CMS_PUBLIC_URL ?? process.env.CMS_URL ?? ""}${m.url}`;
}

async function list(type: string, query = ""): Promise<Entry[] | null> {
  const json = (await cmsFetch(`/${type}?pagination[pageSize]=100&sort=order:asc${query}`)) as { data?: Entry[] } | null;
  return json?.data?.length ? json.data : null;
}

async function single(type: string, query = ""): Promise<Entry | null> {
  const json = (await cmsFetch(`/${type}?${query}`)) as { data?: Entry } | null;
  return json?.data ?? null;
}

const lines = (v: unknown) => ((v as Line[] | undefined) ?? []).map((l) => l.text);

// Ссылка из админки, если она ведёт на конкретную страницу; пустое поле или голый домен («https://max.ru/») — берём из кода.
const link = (v: unknown, fallback: string) => {
  try {
    return typeof v === "string" && new URL(v).pathname.length > 1 ? v : fallback;
  } catch {
    return fallback;
  }
};

export async function getContent(): Promise<SiteContent> {
  const [settings, steps, promos, directions, reasons, reviews, partners, cars, faqCats, faqItems, articles] = await Promise.all([
    single("site-setting", "populate=*"),
    list("work-steps"),
    list("promos", "&populate=image"),
    list("directions", "&populate=*"),
    list("reasons"),
    list("reviews", "&populate=photo"),
    list("partners", "&populate=logo"),
    list("cars", "&populate=image"),
    list("faq-categories"),
    list("faq-items", "&populate=category"),
    cmsFetch("/articles?pagination[pageSize]=100&sort=date:desc&populate=cover") as Promise<{ data?: Entry[] } | null>,
  ]);

  const site: Site = settings
    ? {
        ...localSite,
        phone: settings.phone as string,
        phoneShort: settings.phoneShort as string,
        phoneNote: (settings.phoneNote as string) ?? "",
        email: settings.email as string,
        schedule: lines(settings.schedule),
        offices: ((settings.offices as Entry[]) ?? []).map((o) => ({
          city: o.city as string,
          address: o.address as string,
          coords: [Number(o.lat), Number(o.lng)],
        })),
        socials: {
          telegram: link(settings.telegram, localSite.socials.telegram),
          max: link(settings.max, localSite.socials.max),
          maxChannel: link(settings.maxChannel, localSite.socials.maxChannel),
          vk: link(settings.vk, localSite.socials.vk),
          chat: localSite.socials.chat,
        },
      }
    : localSite;

  const heroStats = (settings?.heroStats as Entry[] | undefined)?.length
    ? (settings!.heroStats as Entry[]).map((s) => ({
        icon: s.icon as IconName,
        value: s.value as string,
        label: s.label as string,
        accent: Boolean(s.accent),
      }))
    : local.heroStats;

  const faqCategories = faqCats
    ? faqCats.map((c) => ({ id: c.key as local.FaqKey, label: c.label as string, icon: c.icon as IconName }))
    : local.faqCategories;

  let faq = local.faq;
  if (faqItems) {
    faq = { general: [], warranty: [], payment: [], logistics: [], docs: [], check: [] };
    for (const item of faqItems) {
      const key = (item.category as Entry | null)?.key as local.FaqKey | undefined;
      if (key) faq[key].push({ q: item.question as string, a: item.answer as string });
    }
  }

  const localFocus = Object.fromEntries(local.geography.map((g) => [g.id, g.mapFocus]));

  return {
    site,
    heroStats,
    workSteps: steps?.map((s) => ({ icon: s.icon as IconName, title: s.title as string, text: s.text as string })) ?? local.workSteps,
    promos: promos?.map((p) => ({ title: p.title as string, text: p.text as string, img: mediaUrl(p.image as Media) })) ?? local.promos,
    geography:
      directions?.map((d) => {
        const id = d.country as local.CountryId;
        return {
          id,
          name: d.name as string,
          tabText: d.tabText as string,
          tabImg: mediaUrl(d.tabImage as Media),
          description: d.description as string,
          features: lines(d.features),
          stats: ((d.stats as Entry[]) ?? []).map((s) => ({ value: s.value as string, label: s.label as string })),
          routes: ((d.routes as Entry[]) ?? []).map((r) => ({
            kind: r.kind as "truck" | "ship",
            title: r.title as string,
            note: r.note as string,
          })),
          mapFocus: localFocus[id] ?? { focus: [50, 55], zoom: 1 },
        };
      }) ?? local.geography,
    reasons: reasons?.map((r) => ({ icon: r.icon as IconName, title: r.title as string, text: r.text as string })) ?? local.reasons,
    reviews:
      reviews?.map((r) => ({
        photo: mediaUrl(r.photo as Media),
        name: r.name as string,
        car: r.car as string,
        pos: (r.photoPosition as string) || undefined,
      })) ?? local.reviews,
    banks: partners?.map((p) => ({ name: p.name as string, logo: mediaUrl(p.logo as Media), w: Number(p.width) })) ?? local.banks,
    cars:
      cars?.map((c) => ({
        id: c.documentId as string,
        country: c.country as local.CountryId,
        title: c.title as string,
        price: Number(c.price),
        specs: c.specs as string,
        img: mediaUrl(c.image as Media),
        priceDrop: (c.priceDrop as string) || undefined,
        market: {
          min: Number(c.marketMin),
          max: Number(c.marketMax),
          position: Number(c.marketPosition),
          label: c.marketLabel as string,
          tone: c.marketTone as "up" | "down",
        },
      })) ?? local.cars,
    faqCategories,
    faq,
    news: articles?.data?.length
      ? articles.data.map((a) => ({
          slug: a.slug as string,
          tag: a.tag as string,
          date: formatDate(a.date as string),
          title: a.title as string,
          excerpt: a.excerpt as string,
          img: mediaUrl(a.cover as Media),
          body: a.body as string,
        }))
      : localNews,
  };
}
