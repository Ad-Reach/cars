import type { NextConfig } from "next";

// Каталоги новых авто — rangauto.ru/new/china и rangauto.ru/new/uae (src/app/new).
// Старый адрес new.rangauto.ru (каталог Китая) перенаправляется на /new/china.
const NEW_HOST = [{ type: "host" as const, value: "new\\.rangauto\\.ru" }];

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      { source: "/", has: NEW_HOST, destination: "https://rangauto.ru/new/china", permanent: true },
      { source: "/:slug([a-z0-9-]+)", has: NEW_HOST, destination: "https://rangauto.ru/new/china/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
