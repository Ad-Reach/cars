import type { NextConfig } from "next";

// new.rangauto.ru — каталог новых авто из Китая: те же приложение и сборка,
// страницы лежат в src/app/new, поддомен обслуживает src/proxy.ts.
const MAIN_HOST = [{ type: "host" as const, value: "(?:www\\.)?rangauto\\.ru" }];

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      { source: "/new", has: MAIN_HOST, destination: "https://new.rangauto.ru/", permanent: true },
      { source: "/new/:slug", has: MAIN_HOST, destination: "https://new.rangauto.ru/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
