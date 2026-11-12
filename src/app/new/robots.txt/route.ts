import { NEW_URL } from "@/lib/newCars";

export function GET() {
  return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\n\nHost: ${NEW_URL}\nSitemap: ${NEW_URL}/sitemap.xml\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
