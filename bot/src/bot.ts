import { Bot, InlineKeyboard, InputFile, Keyboard, type Context } from "grammy";
import { config } from "./config.js";
import { QUESTIONS, findOption, isComplete, describe } from "./quiz.js";
import { getSession, resetSession, type Session } from "./session.js";
import { pickCars, catalogLink, priceText, similarUrl, photoFile, carById, WHEEL_NAME } from "./catalog.js";
import { deliverLead, LEAD_STEPS } from "./lead.js";
import { T, escapeHtml } from "./texts.js";
import { widgets } from "./widgets/render.js";
import { sendWidget, answerWidgetQuery, editMessageWidgetData, type WidgetQuery } from "./widgets/api.js";

export const bot = new Bot(config.token, { client: { apiRoot: config.apiRoot, environment: config.testEnv ? "test" : "prod" } });

// Нижняя клавиатура: всегда под рукой «Перезвоните мне» (номер отправляется одним нажатием)
const mainKeyboard = new Keyboard().requestContact(T.btnContact).row().text(T.btnRestart).resized().persistent();

// ---------- Подбор: виджет, а если он недоступен — обычные кнопки ----------

const fallbackKeyboard = (s: Session) => {
  const kb = new InlineKeyboard();
  for (const q of QUESTIONS) {
    for (const o of q.options) kb.text(`${s.answers[q.id] === o.id ? "✓ " : ""}${o.label}`, `q:${q.id}:${o.id}`);
    kb.row();
  }
  return kb.text(`🔍 ${T.btnGo}`, "q:go");
};

// Если Telegram ответил INPUT_MEDIA_WIDGET_NOT_ALLOWED — виджеты боту запрещены,
// дальше до перезапуска сразу показываем кнопки и не дёргаем API зря.
let widgetsAllowed = config.widgets;
function widgetFailed(error: unknown) {
  console.warn("[widget] не отправился, показываю кнопки:", String(error));
  if (String(error).includes("WIDGET_NOT_ALLOWED")) widgetsAllowed = false;
}

async function sendQuiz(ctx: Context) {
  const s = getSession(ctx.from!.id);
  if (widgetsAllowed) {
    try {
      const msg = await sendWidget(ctx.api, {
        chat_id: ctx.chat!.id,
        html: widgets.quiz.html,
        height: 330,
        chat_data: JSON.stringify({ a: s.answers }),
        allow_queries: true,
      });
      s.quizMessageId = msg.message_id;
      return;
    } catch (error) {
      widgetFailed(error);
    }
  }
  await ctx.reply(T.quizFallback, { parse_mode: "HTML", reply_markup: fallbackKeyboard(s) });
}

/** Применить ответ «b:2». Возвращает false, если такого вопроса/варианта нет. */
function applyAnswer(s: Session, data: string) {
  const [q, o] = data.split(":");
  if (!findOption(q, o)) return false;
  s.answers[q] = o;
  s.car = undefined;
  return true;
}

const PAGE = 4;

/** Показать следующие PAGE машин из подобранных; под ними — «Показать ещё», если остались. */
async function sendCarsPage(api: Context["api"], chatId: number, s: Session) {
  const wheel = findOption("w", s.answers.w);
  const budget = findOption("b", s.answers.b);
  const page = s.shown.slice(s.shownCount, s.shownCount + PAGE);
  s.shownCount += page.length;
  for (const car of page) {
    const caption =
      `<b>${escapeHtml(car.title)}</b>, ${escapeHtml(car.year)}\n${priceText(car)} · ${WHEEL_NAME[car.wheel]}` + (car.specs ? `\n${escapeHtml(car.specs)}` : "");
    const kb = new InlineKeyboard().text(T.btnWant, `car:${car.id}`).url(T.btnMore, similarUrl(car));
    const file = photoFile(car);
    if (file) {
      await api.sendPhoto(chatId, new InputFile(file), { caption, parse_mode: "HTML", reply_markup: kb }).catch(() =>
        api.sendMessage(chatId, caption, { parse_mode: "HTML", reply_markup: kb }),
      );
    } else {
      await api.sendMessage(chatId, caption, { parse_mode: "HTML", reply_markup: kb });
    }
  }
  const left = s.shown.length - s.shownCount;
  const kb = new InlineKeyboard();
  if (left > 0) kb.text(T.btnMoreCars(left), "more").row();
  kb.url(T.btnCatalog, catalogLink(wheel, budget));
  await api.sendMessage(chatId, T.afterCars, { parse_mode: "HTML", reply_markup: kb });
}

async function showCars(api: Context["api"], chatId: number, s: Session) {
  const cars = pickCars(findOption("b", s.answers.b), findOption("w", s.answers.w));
  s.shown = cars;
  s.shownCount = 0;
  if (!cars.length) {
    await api.sendMessage(chatId, T.noCars, { reply_markup: mainKeyboard });
    return;
  }
  await sendCarsPage(api, chatId, s);
}

bot.callbackQuery("more", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
  await sendCarsPage(ctx.api, ctx.chat!.id, getSession(ctx.from.id));
});

// ---------- Команды ----------

bot.command("start", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  resetSession(ctx.from!.id);
  await ctx.reply(T.start(escapeHtml(ctx.from?.first_name ?? "")), { parse_mode: "HTML", reply_markup: mainKeyboard });
  await sendQuiz(ctx);
  // Mini App — для тех, кому удобнее форма с фото (если задан PUBLIC_URL)
  if (config.publicUrl) {
    await ctx.reply("Или заполните заявку в приложении — там фото машин и всё на одном экране:", {
      reply_markup: new InlineKeyboard().webApp(T.btnMiniApp, `${config.publicUrl}/`),
    });
  }
});

// /id — узнать id чата, чтобы вписать его в LEAD_CHAT_IDS
bot.command("id", (ctx) => ctx.reply(`id этого чата: <code>${ctx.chat.id}</code>`, { parse_mode: "HTML" }));

bot.hears(T.btnRestart, async (ctx) => {
  resetSession(ctx.from!.id);
  await sendQuiz(ctx);
});

// ---------- Виджет подбора: тапы приходят как widget_query ----------

bot.use(async (ctx, next) => {
  const q = (ctx.update as { widget_query?: WidgetQuery }).widget_query;
  if (!q) return next();
  const s = getSession(q.from.id);
  if (q.data === "go") {
    // отвечаем сразу (лимит 15 секунд), машины ищем после
    await answerWidgetQuery(ctx.api, q.id, "ok");
    if (!isComplete(s.answers)) return;
    if (q.chat && q.message_id) {
      await editMessageWidgetData(ctx.api, q.chat.id, q.message_id, JSON.stringify({ a: s.answers, done: 1 })).catch(() => {});
    }
    await showCars(ctx.api, q.chat?.id ?? q.from.id, s);
    return;
  }
  applyAnswer(s, q.data);
  await answerWidgetQuery(ctx.api, q.id, JSON.stringify(s.answers));
  // сохраняем выбор в самом сообщении — переживёт перезапуск виджета
  if (q.chat && q.message_id) {
    await editMessageWidgetData(ctx.api, q.chat.id, q.message_id, JSON.stringify({ a: s.answers })).catch(() => {});
  }
});

// ---------- Запасной подбор кнопками ----------

bot.callbackQuery(/^q:(.+)$/, async (ctx) => {
  const s = getSession(ctx.from.id);
  const data = ctx.match[1];
  if (data === "go") {
    if (!isComplete(s.answers)) return ctx.answerCallbackQuery(T.quizIncomplete);
    await ctx.answerCallbackQuery();
    return showCars(ctx.api, ctx.chat!.id, s);
  }
  if (applyAnswer(s, data)) await ctx.editMessageReplyMarkup({ reply_markup: fallbackKeyboard(s) }).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ---------- «Хочу эту» ----------

bot.callbackQuery(/^car:([a-z0-9-]+)$/, async (ctx) => {
  const s = getSession(ctx.from.id);
  const car = carById(ctx.match[1]);
  await ctx.answerCallbackQuery();
  if (!car) return ctx.reply(T.askContact, { parse_mode: "HTML", reply_markup: mainKeyboard });
  s.car = car;
  await ctx.reply(T.carChosen(escapeHtml(car.title)), { parse_mode: "HTML", reply_markup: mainKeyboard });
});

// ---------- Контакт → заявка ----------

async function submitLead(ctx: Context, phone: string) {
  const user = ctx.from!;
  const s = getSession(user.id);
  if (s.leadSentAt && Date.now() - s.leadSentAt < 60_000) return; // двойное нажатие
  const name = [ctx.message?.contact?.first_name ?? user.first_name, ctx.message?.contact?.last_name ?? user.last_name].filter(Boolean).join(" ");
  const ok = await deliverLead(ctx.api, { phone, name, user: { id: user.id, username: user.username }, session: s });
  if (!ok && (config.leadChatIds.length || config.leadApiUrl || config.smtp.host)) return ctx.reply(T.leadFailed, { reply_markup: mainKeyboard });
  s.leadSentAt = Date.now();
  await ctx.reply(T.thanks, { reply_markup: mainKeyboard });
  await sendLeadCard(ctx, s);
}

async function sendLeadCard(ctx: Context, s: Session) {
  const short = (v: string) => (v.length > 34 ? `${v.slice(0, 33)}…` : v);
  const rows: [string, string][] = describe(s.answers).map(([k, v]) => [k, v]);
  if (s.car) rows.push(["Машина", short(s.car.title)]);
  const data = { rows: rows.map(([k, v]) => [escapeHtml(k), escapeHtml(v)] as [string, string]), url: s.car ? similarUrl(s.car) : catalogLink(findOption("w", s.answers.w), findOption("b", s.answers.b)), step: 0 };
  if (!widgetsAllowed) return;
  try {
    const msg = await sendWidget(ctx.api, { chat_id: ctx.chat!.id, html: widgets.lead.html, height: 160 + rows.length * 34, chat_data: JSON.stringify(data) });
    s.leadCard = { messageId: msg.message_id, data };
  } catch (error) {
    widgetFailed(error);
  }
}

bot.on("message:contact", (ctx) => submitLead(ctx, ctx.message.contact.phone_number));

// ---------- Статус заявки: кнопки у менеджеров обновляют карточку у клиента ----------

bot.callbackQuery(/^st:(\d+):(\d+)$/, async (ctx) => {
  const userId = Number(ctx.match[1]);
  const step = Number(ctx.match[2]);
  const card = getSession(userId).leadCard;
  if (!card) return ctx.answerCallbackQuery("Карточка клиента не найдена (бот перезапускался или виджеты выключены)");
  card.data.step = step;
  await editMessageWidgetData(ctx.api, userId, card.messageId, JSON.stringify(card.data)).catch(() => {});
  await ctx.answerCallbackQuery(`Клиент видит статус: ${LEAD_STEPS[step]}`);
});

// ---------- Свободный текст: номер телефона или пожелание ----------

bot.on("message:text", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  const text = ctx.message.text.trim();
  const digits = text.replace(/\D/g, "");
  if (/^[\d\s()+-]{10,20}$/.test(text) && digits.length >= 10 && digits.length <= 12) return submitLead(ctx, text);
  const s = getSession(ctx.from.id);
  s.comment = [s.comment, text].filter(Boolean).join("; ").slice(0, 500);
  await ctx.reply(T.wishSaved, { reply_markup: mainKeyboard });
});

bot.catch((err) => console.error("[bot]", err.error));
