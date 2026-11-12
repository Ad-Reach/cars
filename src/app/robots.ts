import type { MetadataRoute } from "next";
import { NEW_CARS_PUBLIC } from "@/lib/newCarsFlag";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: NEW_CARS_PUBLIC ? ["/api/"] : ["/api/", "/new"] },
    sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
    host: SITE_URL,
  };
}
