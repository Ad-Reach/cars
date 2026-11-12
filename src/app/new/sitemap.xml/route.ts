import { newCars, NEW_URL } from "@/lib/newCars";

export function GET() {
  const urls = [`${NEW_URL}/`, ...newCars.map((c) => `${NEW_URL}/${c.slug}`)];
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u, i) => `  <url><loc>${u}</loc><changefreq>daily</changefreq><priority>${i ? "0.8" : "1.0"}</priority></url>`).join("\n") +
    "\n</urlset>\n";
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
