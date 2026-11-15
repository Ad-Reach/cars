import { createServer } from "node:http";
import { config } from "./config.js";

// HTTP-сервер приложения. Сейчас только /health для App Platform; сюда же подключится Mini App.
export function startServer() {
  const server = createServer((req, res) => {
    if (req.url === "/" || req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("ok");
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(config.port, "0.0.0.0", () => console.log(`HTTP :${config.port}`));
  return server;
}
