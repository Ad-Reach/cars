import type { NextConfig } from "next";

// Каталог новых авто из Китая — rangauto.ru/new (src/app/new).
// Старый адрес new.rangauto.ru перенаправляется туда.
const NEW_HOST = [{ type: "host" as const, value: "new\\.rangauto\\.ru" }];

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      { source: "/", has: NEW_HOST, destination: "https://rangauto.ru/new", permanent: true },
      { source: "/:slug([a-z0-9-]+)", has: NEW_HOST, destination: "https://rangauto.ru/new/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
