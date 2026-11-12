import type { ReactNode } from "react";
import { Footer } from "@/components/sections/Footer";
import { Header } from "@/components/sections/Header";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/seo";

// rangauto.ru/new — каталог новых авто из Китая. Якоря шапки и подвала («#contacts» и т.п.)
// ведут на главную, поэтому base — адрес сайта.
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
