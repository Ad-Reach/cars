import type { Metadata, Viewport } from "next";
import { Advent_Pro, Onest } from "next/font/google";
import { LeadModalProvider } from "@/components/lead/LeadModal";
import { SITE_URL } from "@/lib/seo";
import "./globals.css";

// Заголовки — Advent Pro (ширина UltraExpanded через ось wdth).
const advent = Advent_Pro({
  variable: "--font-advent",
  subsets: ["latin", "cyrillic"],
  axes: ["wdth"],
});

// TODO: в макете Gilroy (платный). Onest — временная замена до получения файлов шрифта.
const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Ранг Авто — авто из Китая, Кореи и Японии под ключ",
  description:
    "Подберём, проверим, растаможим и привезём автомобиль из Китая, Кореи и Японии до вашего города. Импорт авто с 2018 года, гарантия на ДВС и КПП.",
};

export const viewport: Viewport = {
  themeColor: "#2b2b2b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" data-scroll-behavior="smooth" className={`${advent.variable} ${onest.variable}`}>
      <body>
        <LeadModalProvider>{children}</LeadModalProvider>
        {/* Яндекс.Метрика без JS; сам счётчик — в src/instrumentation-client.ts */}
        <noscript>
          <div>
            <img src="https://mc.yandex.ru/watch/114003002" style={{ position: "absolute", left: "-9999px" }} alt="" />
          </div>
        </noscript>
      </body>
    </html>
  );
}
