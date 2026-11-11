import * as local from "@/data/content";
import { news, type Article } from "@/data/news";
import { site } from "@/data/site";

// Весь контент сайта хранится в репозитории: src/data/*.ts.
// Правка контента = коммит в main → merge в production → App Platform пересобирает сайт.

export type Site = typeof site;

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

export async function getContent(): Promise<SiteContent> {
  return {
    site,
    heroStats: local.heroStats,
    workSteps: local.workSteps,
    promos: local.promos,
    geography: local.geography,
    reasons: local.reasons,
    reviews: local.reviews,
    banks: local.banks,
    cars: local.cars,
    faqCategories: local.faqCategories,
    faq: local.faq,
    news,
  };
}
