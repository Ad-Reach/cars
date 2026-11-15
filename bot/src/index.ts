import { bot } from "./bot.js";
import { widgets } from "./widgets/render.js";
import { startServer } from "./server.js";
import { config } from "./config.js";

// Long polling (вебхук не нужен) + HTTP-сервер для проверки здоровья.
// allowed_updates явно включает widget_query — иначе тапы по виджету не придут.

const server = startServer(bot.api);
await bot.api.setMyCommands([{ command: "start", description: "Подобрать авто" }]);
// Кнопка меню слева от поля ввода открывает Mini App
if (config.publicUrl) {
  await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Заявка", web_app: { url: `${config.publicUrl}/` } } });
}
console.log(`Виджеты: quiz ${widgets.quiz.packed}/4096, lead ${widgets.lead.packed}/4096 байт (сжато)`);

bot.start({
  allowed_updates: ["message", "callback_query", "widget_query"] as never,
  onStart: (me) => console.log(`Бот @${me.username} запущен. Ctrl+C — остановить.`),
});

const stop = () => {
  server.close();
  void bot.stop();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
