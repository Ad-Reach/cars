import type { ReactNode } from "react";
import { Footer } from "@/components/sections/Footer";
import { Header } from "@/components/sections/Header";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/seo";

// new.rangauto.ru: страницы /new/* отдаются по домену поддомена (rewrites в next.config.ts),
// поэтому якоря шапки и подвала ведут на основной сайт.
export default async function NewCarsLayout({ children }: { children: ReactNode }) {
  const { site } = await getContent();
  return (
    <>
      <Header site={site} base={SITE_URL} />
      {children}
      <Footer site={site} base={SITE_URL} />
    </>
  );
}
