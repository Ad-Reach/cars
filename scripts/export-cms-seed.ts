import fs from "node:fs";
import path from "node:path";
import * as c from "@/data/content";
import { news } from "@/data/news";
import { site } from "@/data/site";

const root = process.cwd();
const out = path.join(root, "cms/seed");
const images = path.join(out, "images");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(images, { recursive: true });

const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const isoDate = (ru: string) => {
  const [d, m, y] = ru.split(" ");
  return `${y}-${String(months.indexOf(m) + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
};

const image = (src: string) => {
  const file = path.join(root, "public", src);
  const name = src.replace(/^\/img\//, "").replace(/\//g, "-");
  if (src.endsWith(".svg")) return name.replace(/\.svg$/, ".png");
  fs.copyFileSync(file, path.join(images, name));
  return name;
};

const data = {
  settings: {
    phone: site.phone,
    phoneShort: site.phoneShort,
    phoneNote: site.phoneNote,
    email: site.email,
    schedule: site.schedule.map((text) => ({ text })),
    offices: site.offices.map((o) => ({ city: o.city, address: o.address, lat: o.coords[0], lng: o.coords[1] })),
    telegram: site.socials.telegram,
    max: site.socials.max,
    maxChannel: site.socials.maxChannel,
    vk: site.socials.vk,
    heroStats: c.heroStats.map((s) => ({ icon: s.icon, value: s.value, label: s.label, accent: Boolean(s.accent) })),
  },
  workSteps: c.workSteps.map((s, order) => ({ ...s, order })),
  promos: c.promos.map((p, order) => ({ title: p.title, text: p.text, image: image(p.img), order })),
  directions: c.geography.map((g, order) => ({
    country: g.id,
    name: g.name,
    tabText: g.tabText,
    tabImage: image(g.tabImg),
    description: g.description,
    features: g.features.map((text) => ({ text })),
    stats: g.stats,
    routes: g.routes,
    order,
  })),
  reasons: c.reasons.map((r, order) => ({ ...r, order })),
  reviews: c.reviews.map((r, order) => ({ name: r.name, car: r.car, photo: image(r.photo), photoPosition: r.pos ?? "50% 62%", order })),
  partners: c.banks.map((b, order) => ({ name: b.name, logo: image(b.logo), width: b.w, order })),
  cars: c.cars.map((car, order) => ({
    title: car.title,
    country: car.country,
    price: car.price,
    specs: car.specs,
    image: image(car.img),
    priceDrop: car.priceDrop ?? null,
    marketMin: car.market?.min ?? 0,
    marketMax: car.market?.max ?? 0,
    marketPosition: car.market?.position ?? 0,
    marketLabel: car.market?.label ?? "",
    marketTone: car.market?.tone === "down" ? "down" : "up",
    order,
  })),
  faqCategories: c.faqCategories.map((f, order) => ({ key: f.id, label: f.label, icon: f.icon, order })),
  faqItems: c.faqCategories.flatMap((f) => c.faq[f.id].map((item, order) => ({ category: f.id, question: item.q, answer: item.a, order }))),
  articles: news.map((a) => ({
    title: a.title,
    slug: a.slug,
    tag: a.tag,
    date: isoDate(a.date),
    excerpt: a.excerpt,
    cover: image(a.img),
    body: a.body.trim(),
  })),
};

fs.writeFileSync(path.join(out, "data.json"), JSON.stringify(data, null, 2) + "\n");
const svgs = c.banks.map((b) => ({ src: path.join(root, "public", b.logo), out: path.join(images, image(b.logo)), w: b.w }));
fs.writeFileSync(path.join(out, ".svg-todo.json"), JSON.stringify(svgs));
console.log("ok", Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])));
