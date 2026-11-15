// npm run widget:check — показывает размер виджетов относительно лимитов Telegram
import { widgets } from "./render.js";
for (const [name, w] of Object.entries(widgets)) console.log(`${name}: ${w.size} / 32768 байт, сжато ${w.packed} / 4096`);
