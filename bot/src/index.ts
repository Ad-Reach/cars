import { bot } from "./bot.js";
import { widgets } from "./widgets/render.js";

// Локальный запуск: long polling, без вебхука и без сервера.
// allowed_updates явно включает widget_query — иначе тапы по виджету не придут.

await bot.api.setMyCommands([{ command: "start", description: "Подобрать авто" }]);
console.log(`Виджеты: quiz ${widgets.quiz.packed}/4096, lead ${widgets.lead.packed}/4096 байт (сжато)`);

bot.start({
  allowed_updates: ["message", "callback_query", "widget_query"] as never,
  onStart: (me) => console.log(`Бот @${me.username} запущен. Ctrl+C — остановить.`),
});

const stop = () => bot.stop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
