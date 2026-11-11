import { Header } from "@/components/sections/Header";
import { Hero } from "@/components/sections/Hero";
import { CatalogPreview } from "@/components/sections/CatalogPreview";
import { HowWeWork } from "@/components/sections/HowWeWork";
import { Promos } from "@/components/sections/Promos";
import { Geography } from "@/components/sections/Geography";
import { WhyUs } from "@/components/sections/WhyUs";
import { Reviews } from "@/components/sections/Reviews";
import { Partners } from "@/components/sections/Partners";
import { Faq } from "@/components/sections/Faq";
import { News } from "@/components/sections/News";
import { Contacts } from "@/components/sections/Contacts";
import { LeadSection } from "@/components/sections/LeadSection";
import { Footer } from "@/components/sections/Footer";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { getCatalog } from "@/lib/catalog";
import { getContent } from "@/lib/content";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Ранг Авто — авто из Китая, Кореи и Японии под ключ",
  description:
    "Подберём, проверим, растаможим и привезём автомобиль из Китая, Кореи и Японии до вашего города. Импорт авто с 2018 года, гарантия на ДВС и КПП.",
  path: "/",
});

export default async function Home() {
  const c = await getContent();
  const { cars, brands } = await getCatalog(c.cars);

  return (
    <>
      <Header site={c.site} />
      <main>
        <Hero heroStats={c.heroStats} brands={brands} />
        <CatalogPreview cars={cars} />
        <HowWeWork workSteps={c.workSteps} />
        <Promos promos={c.promos} />
        <Geography geography={c.geography} />
        <WhyUs reasons={c.reasons} />
        <Reviews reviews={c.reviews} />
        <Partners banks={c.banks} />
        <Faq faq={c.faq} faqCategories={c.faqCategories} site={c.site} />
        <News news={c.news} />
        <Contacts site={c.site} />
        <LeadSection site={c.site} />
      </main>
      <Footer site={c.site} />
      <ScrollReveal />
    </>
  );
}
