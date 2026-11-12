import type { MetadataRoute } from "next";
import { getContent } from "@/lib/content";
import { carHref, NEW_CARS_PUBLIC, newCars } from "@/lib/newCars";
import { SITE_URL } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { news } = await getContent();
  const url = (path: string) => new URL(path, SITE_URL).toString();
  return [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    ...news.map((n) => ({ url: url(`/news/${n.slug}`), changeFrequency: "monthly" as const, priority: 0.7 })),
    ...(NEW_CARS_PUBLIC
      ? [
          { url: url("/new"), changeFrequency: "daily" as const, priority: 0.9 },
          ...newCars.map((c) => ({ url: url(carHref(c.slug)), changeFrequency: "daily" as const, priority: 0.8 })),
        ]
      : []),
    { url: url("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: url("/agreement"), changeFrequency: "yearly", priority: 0.2 },
  ];
}
