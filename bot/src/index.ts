import { GrammyError } from "grammy";
import { bot } from "./bot.js";
import { widgets } from "./widgets/render.js";
import { startServer } from "./server.js";
import { config } from "./config.js";

// Long polling (вебхук не нужен) + HTTP-сервер (Mini App и /health).
// Запуск не должен падать из-за Telegram: при передеплое старый контейнер ещё какое-то время
// опрашивает Telegram, и новому приходит 409 Conflict — ждём и пробуем снова, а /health отвечает.

const server = startServer(bot.api);
console.log(`Виджеты: quiz ${widgets.quiz.packed}/4096, lead ${widgets.lead.packed}/4096 байт (сжато)`);

async function setup() {
  try {
    await bot.api.setMyCommands([{ command: "start", description: "Подобрать авто" }]);
    // Кнопка меню слева от поля ввода открывает Mini App
    if (config.publicUrl) {
      await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Заявка", web_app: { url: `${config.publicUrl}/` } } });
    }
  } catch (error) {
    console.error("[start] настройка команд/меню не удалась:", String(error));
  }
}

let stopping = false;

async function poll() {
  for (let attempt = 1; !stopping; attempt++) {
    try {
      await bot.start({
        allowed_updates: ["message", "callback_query", "widget_query"] as never,
        onStart: (me) => console.log(`Бот @${me.username} запущен`),
      });
      return; // bot.stop()
    } catch (error) {
      const conflict = error instanceof GrammyError && error.error_code === 409;
      const delay = Math.min(30, attempt * 5);
      console.error(`[start] ${conflict ? "409: работает другой экземпляр бота" : String(error)} — повтор через ${delay} с`);
      await new Promise((r) => setTimeout(r, delay * 1000));
    }
  }
}

await setup();
void poll();

const stop = () => {
  stopping = true;
  server.close();
  void bot.stop();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
