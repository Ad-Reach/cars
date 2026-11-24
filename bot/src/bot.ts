import { fileURLToPath } from "node:url";
import { Bot, InlineKeyboard, InputFile, Keyboard, type Context } from "grammy";
import { config } from "./config.js";
import { brand } from "./brand.js";
import { getSession, type Form, type Session } from "./session.js";
import { pickCars, catalogLink, priceText, similarUrl, photoFile, carById, WHEEL_NAME, type Car } from "./catalog.js";
import { budgetsFor, bracketOf, budgetPhrase, lowerFirst, wheelLabel, WHEEL_CHOICES, CONDITIONS, type WheelChoice } from "./flow.js";
import { deliverLead, LEAD_STEPS } from "./lead.js";
import { T, escapeHtml } from "./texts.js";
import { widgets } from "./widgets/render.js";
import { sendWidget, editMessageWidgetData } from "./widgets/api.js";

export const bot = new Bot(config.token, { client: { apiRoot: config.apiRoot, environment: config.testEnv ? "test" : "prod" } });

// Если Telegram ответил INPUT_MEDIA_WIDGET_NOT_ALLOWED — виджеты боту запрещены (в проде сейчас так),
// дальше до перезапуска не дёргаем API зря. Виджет — только карточка заявки у клиента.
let widgetsAllowed = config.widgets;

// ---------- Главное меню ----------

const WELCOME_PHOTO = new URL("../data/welcome.jpg", import.meta.url);

const menuKeyboard = () => new InlineKeyboard().text(T.btnLead, "lead").row().text(T.btnCatalogs, "cat");
const sendMenu = (ctx: Context) => ctx.reply(T.menu, { reply_markup: menuKeyboard() });

bot.command("start", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  const s = getSession(ctx.from!.id);
  s.form.at = undefined; // незавершённая заявка сохраняется, но бот больше не ждёт от клиента текст
  // Приветственная картинка с текстом в подписи. remove_keyboard — убирает нижнюю клавиатуру прошлой версии бота.
  // Картинку можно заменить файлом data/welcome.jpg (подпись — до 1024 символов).
  await ctx.replyWithPhoto(new InputFile(fileURLToPath(WELCOME_PHOTO)), { caption: T.start, reply_markup: { remove_keyboard: true } }).catch((error) => {
    console.error("[welcome]", String(error));
    return ctx.reply(T.start, { reply_markup: { remove_keyboard: true } });
  });
  await sendMenu(ctx);
});
bot.command("menu", (ctx) => sendMenu(ctx));

// /id — узнать id чата, чтобы вписать его в LEAD_CHAT_IDS
bot.command("id", (ctx) => ctx.reply(`id этого чата: <code>${ctx.chat.id}</code>`, { parse_mode: "HTML" }));

bot.callbackQuery("menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  getSession(ctx.from.id).form.at = undefined;
  await sendMenu(ctx);
});

// ---------- Каталоги ----------

const PAGE = 4;

function catalogKeyboard() {
  const kb = new InlineKeyboard();
  for (const [wheel, name] of [["l", "Левый руль"], ["r", "Правый руль"]] as const) {
    for (const b of budgetsFor(wheel)) kb.text(`${name} — ${lowerFirst(b.label)}`, `bk:${wheel}:${b.id}`).row();
  }
  return kb;
}

bot.callbackQuery("cat", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(T.catalogIntro, { reply_markup: catalogKeyboard() });
});

/** Ссылка «Смотреть полный каталог на сайте»: по выбранной категории или главная сайта. */
function siteCatalogUrl(s: Session) {
  const budget = s.sel && budgetsFor(s.sel.wheel).find((b) => b.id === s.sel!.budget);
  return s.sel && budget ? catalogLink({ wheels: [s.sel.wheel] }, budget) : brand.site;
}

/** Показать следующие PAGE машин; под ними — «Не нашли подходящий автомобиль?» с кнопками. */
async function sendCarsPage(ctx: Context, s: Session) {
  const chatId = ctx.chat!.id;
  const page = s.shown.slice(s.shownCount, s.shownCount + PAGE);
  s.shownCount += page.length;
  for (const car of page) {
    const caption =
      `<b>${escapeHtml(car.title)}</b>, ${escapeHtml(car.year)}\n${priceText(car)} · ${WHEEL_NAME[car.wheel]}` + (car.specs ? `\n${escapeHtml(car.specs)}` : "");
    const kb = new InlineKeyboard().text(T.btnCalc, `calc:${car.id}`).row().text(T.btnSimilar, `sim:${car.id}`);
    const file = photoFile(car);
    if (file) {
      // grammY не умеет file:-ссылки (качает их по сети и падает) — отдаём обычный путь
      await ctx.api.sendPhoto(chatId, new InputFile(fileURLToPath(file)), { caption, parse_mode: "HTML", reply_markup: kb }).catch((error) => {
        console.error("[photo]", car.id, String(error));
        return ctx.api.sendMessage(chatId, caption, { parse_mode: "HTML", reply_markup: kb });
      });
    } else {
      await ctx.api.sendMessage(chatId, caption, { parse_mode: "HTML", reply_markup: kb });
    }
  }
  const left = s.shown.length - s.shownCount;
  const kb = new InlineKeyboard();
  if (left > 0) kb.text(T.btnMoreCars(left), "more").row();
  kb.text(T.btnPick, "lead").row().url(T.btnSite, siteCatalogUrl(s)).row().text(T.btnOtherBudget, "cat").row().text(T.btnMenu, "menu");
  await ctx.api.sendMessage(chatId, T.notFound, { reply_markup: kb });
}

bot.callbackQuery(/^bk:([lr]):(\d)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const wheel = ctx.match[1] as "l" | "r";
  const budget = budgetsFor(wheel).find((b) => b.id === ctx.match[2]);
  if (!budget) return;
  const s = getSession(ctx.from.id);
  s.sel = { wheel, budget: budget.id };
  s.shown = pickCars(budget, { wheels: [wheel] });
  s.shownCount = 0;
  await ctx.reply(T.carsHeader(wheel === "l" ? "левым" : "правым", budgetPhrase(budget)));
  if (!s.shown.length) {
    await ctx.reply(T.noCars);
    s.shownCount = 0;
  }
  await sendCarsPage(ctx, s);
});

bot.callbackQuery("more", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
  await sendCarsPage(ctx, getSession(ctx.from.id));
});

// ---------- Анкета ----------

type Step = NonNullable<Form["at"]>;

// Расчёт на конкретную машину: руль и бюджет известны из машины, спрашиваем остальное
const stepsFor = (f: Form): Step[] => (f.car ? ["condition", "city", "phone", "consent"] : ["wheel", "budget", "condition", "city", "phone", "consent"]);

const filled = (f: Form, step: Step) =>
  ({ wheel: !!f.wheel, budget: !!f.budget, condition: !!f.condition, city: !!f.city, phone: !!f.phone || !!f.viaTelegram, consent: !!f.consent })[step];

/** Клиент уже что-то ответил сам (то, что подставили из машины, не считается). */
const hasAnswers = (f: Form) => !!(f.condition || f.city || f.phone || f.viaTelegram || (!f.car && (f.wheel || f.budget)));

const firstMissing = (f: Form): Step => stepsFor(f).find((st) => !filled(f, st)) ?? "consent";

const phoneKeyboard = new Keyboard().requestContact(T.btnPhone).row().text(T.btnTelegram).oneTime().resized();

/** Кнопки навигации — одинаковые и в одном ряду на каждом шаге; на первом шаге только «Главное меню». */
function withNav(kb: InlineKeyboard, f: Form, step: Step) {
  kb.row();
  if (stepsFor(f).indexOf(step) > 0) kb.text(T.btnBack, `nav:back:${step}`);
  return kb.text(T.btnNavMenu, `nav:menu:${step}`);
}

function stepContent(f: Form, step: Step): { text: string; kb: InlineKeyboard } {
  const kb = new InlineKeyboard();
  const mark = (on: boolean) => (on ? "✓ " : "");
  switch (step) {
    case "wheel":
      for (const w of WHEEL_CHOICES) kb.text(`${mark(f.wheel === w.id)}${w.label}`, `w:${w.id}`).row();
      return { text: T.wheelQ, kb: withNav(kb, f, step) };
    case "budget":
      for (const b of budgetsFor(f.wheel ?? "l")) kb.text(`${mark(f.budget === b.label)}${b.label}`, `b:${b.id}`).row();
      return { text: T.budgetQ, kb: withNav(kb, f, step) };
    case "condition":
      for (const c of CONDITIONS) kb.text(`${mark(f.condition === c.label)}${c.label}`, `c:${c.id}`).row();
      return { text: T.conditionQ, kb: withNav(kb, f, step) };
    case "city":
      if (f.city) kb.text(`✓ ${f.city}`, "keep:city").row();
      return { text: T.cityQ, kb: withNav(kb, f, step) };
    case "phone":
      if (f.phone || f.viaTelegram) kb.text(`✓ ${f.phone || T.btnTelegram}`, "keep:phone").row();
      return { text: T.phoneQ, kb: withNav(kb, f, step) };
    case "consent":
      kb.text(T.btnConsent, "consent").row();
      return { text: T.consentQ, kb: withNav(kb, f, step) };
  }
}

/** Задать вопрос анкеты. edit — заменить сообщение с нажатой кнопкой (так «Назад» не засоряет чат). */
async function ask(ctx: Context, s: Session, step: Step, edit = false) {
  s.form.at = step;
  const { text, kb } = stepContent(s.form, step);
  let sent = false;
  if (edit && ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, { reply_markup: kb });
      sent = true;
    } catch (error) {
      sent = String(error).includes("not modified");
    }
  }
  if (!sent) await ctx.reply(text, { reply_markup: kb });
  // номер можно отправить одной кнопкой — для неё нужна нижняя клавиатура (inline-кнопки так не умеют)
  if (step === "phone") await ctx.reply(T.phoneHint, { reply_markup: phoneKeyboard });
}

/** После ответа на вопрос — следующий. */
async function advance(ctx: Context, s: Session, from: Step, edit: boolean) {
  const steps = stepsFor(s.form);
  const next = steps[steps.indexOf(from) + 1] ?? "consent";
  await ask(ctx, s, next, edit);
}

type Action = NonNullable<Session["pending"]>;

async function beginFresh(ctx: Context, s: Session, action: Action) {
  s.form = {};
  s.pending = undefined;
  const car = action.carId ? carById(action.carId) : undefined;
  if (action.kind === "calc" && car) {
    s.form = { car, wheel: car.wheel, budget: bracketOf(car)?.label };
    await ctx.reply(T.calcIntro(escapeHtml(car.title)), { parse_mode: "HTML" });
    return ask(ctx, s, "condition");
  }
  if (action.kind === "sim" && car) s.form.similarTo = car;
  return ask(ctx, s, "wheel");
}

/** Начать анкету; если есть незавершённая — сначала спросить, продолжать ли её. */
async function startAnketa(ctx: Context, action: Action) {
  const s = getSession(ctx.from!.id);
  if (!hasAnswers(s.form)) return beginFresh(ctx, s, action);
  s.pending = action;
  s.form.at = undefined;
  const kb = new InlineKeyboard().text(T.btnResume, "resume").row().text(T.btnNewLead, "newlead").row().text(T.btnMenu, "menu");
  await ctx.reply(T.draftFound, { reply_markup: kb });
}

bot.callbackQuery("lead", async (ctx) => {
  await ctx.answerCallbackQuery();
  await startAnketa(ctx, { kind: "lead" });
});
bot.callbackQuery(/^(calc|sim):([a-z0-9-]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!carById(ctx.match[2])) return ctx.reply(T.useButtons, { reply_markup: menuKeyboard() });
  await startAnketa(ctx, { kind: ctx.match[1] as "calc" | "sim", carId: ctx.match[2] });
});

bot.callbackQuery("resume", async (ctx) => {
  await ctx.answerCallbackQuery();
  const s = getSession(ctx.from.id);
  if (!hasAnswers(s.form)) return beginFresh(ctx, s, s.pending ?? { kind: "lead" });
  await ask(ctx, s, firstMissing(s.form));
});

bot.callbackQuery("newlead", async (ctx) => {
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard().text(T.btnYesNew, "newlead:yes").row().text(T.btnKeep, "resume");
  await ctx.reply(T.confirmNew, { reply_markup: kb });
});
bot.callbackQuery("newlead:yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  const s = getSession(ctx.from.id);
  await beginFresh(ctx, s, s.pending ?? { kind: "lead" });
});

// Ответы кнопками. Каждый берёт «свой» шаг из кнопки, а не из состояния, — старые сообщения работают так же.
bot.callbackQuery(/^w:([lra])$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const s = getSession(ctx.from.id);
  s.form.wheel = ctx.match[1] as WheelChoice;
  // руль изменился — бюджет мог перестать подходить (у правого руля меньше категорий): сбрасываем
  if (!budgetsFor(s.form.wheel).some((b) => b.label === s.form.budget)) s.form.budget = undefined;
  await advance(ctx, s, "wheel", true);
});
bot.callbackQuery(/^b:(\d)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const s = getSession(ctx.from.id);
  const budget = budgetsFor(s.form.wheel ?? "l").find((b) => b.id === ctx.match[1]);
  if (!budget) return;
  s.form.budget = budget.label;
  await advance(ctx, s, "budget", true);
});
bot.callbackQuery(/^c:([nua])$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const s = getSession(ctx.from.id);
  s.form.condition = CONDITIONS.find((c) => c.id === ctx.match[1])?.label;
  await advance(ctx, s, "condition", true);
});
bot.callbackQuery(/^keep:(city|phone)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await advance(ctx, getSession(ctx.from.id), ctx.match[1] as Step, false);
});

// Навигация. «Назад» хранит ответы: вопрос показывается с отмеченным прежним выбором.
bot.callbackQuery(/^nav:back:(\w+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const s = getSession(ctx.from.id);
  const steps = stepsFor(s.form);
  const idx = steps.indexOf(ctx.match[1] as Step);
  await ask(ctx, s, steps[Math.max(0, idx - 1)], true);
});
bot.callbackQuery(/^nav:menu:\w+$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const s = getSession(ctx.from.id);
  if (!hasAnswers(s.form)) {
    s.form = {};
    return sendMenu(ctx);
  }
  s.form.at = undefined;
  const kb = new InlineKeyboard().text(T.btnResume, "resume").row().text(T.btnGoMenu, "menu");
  await ctx.reply(T.unfinished, { reply_markup: kb });
});

// ---------- Телефон и город текстом, контакт кнопкой ----------

/** Российский номер в виде +7XXXXXXXXXX: «8 900…», «900…» и «+7 900…» приводятся к одному виду, остальное — не номер. */
const normalPhone = (text: string) => {
  if (!/^[\d\s()+-]{10,20}$/.test(text)) return null;
  let digits = text.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("9")) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return digits.length === 11 && digits.startsWith("7") ? `+${digits}` : null;
};

bot.on("message:contact", async (ctx) => {
  const s = getSession(ctx.from.id);
  if (s.form.at !== "phone") return ctx.reply(T.useButtons, { reply_markup: menuKeyboard() });
  // номер из Telegram может быть и не российским — тогда берём как есть
  const raw = ctx.message.contact.phone_number;
  s.form.phone = normalPhone(raw) ?? `+${raw.replace(/\D/g, "")}`;
  s.form.viaTelegram = false;
  await advance(ctx, s, "phone", false);
});

bot.on("message:text", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  const s = getSession(ctx.from.id);
  const text = ctx.message.text.trim();
  if (s.form.at === "city") {
    s.form.city = text.slice(0, 100);
    return advance(ctx, s, "city", false);
  }
  if (s.form.at === "phone") {
    if (text === T.btnTelegram) {
      s.form.viaTelegram = true;
      s.form.phone = undefined;
      return advance(ctx, s, "phone", false);
    }
    const phone = normalPhone(text);
    if (!phone) return ctx.reply(T.phoneBad);
    s.form.phone = phone;
    s.form.viaTelegram = false;
    return advance(ctx, s, "phone", false);
  }
  await ctx.reply(T.useButtons, { reply_markup: menuKeyboard() });
});

// ---------- Согласие → заявка менеджеру ----------

bot.callbackQuery("consent", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = ctx.from;
  const s = getSession(user.id);
  const f = s.form;
  if (!filled(f, "phone")) {
    // после отправки анкета пустая: повторное нажатие «Согласен» сразу после неё — двойной тап, ничего не делаем
    if (s.leadSentAt && Date.now() - s.leadSentAt < 10_000) return;
    return ask(ctx, s, firstMissing(f));
  }
  f.consent = true;

  const rows: [string, string][] = [["Тип", f.car ? "Расчёт стоимости на автомобиль" : f.similarTo ? "Подбор похожего автомобиля" : "Анкета"]];
  if (f.similarTo) rows.push(["Похожий на", f.similarTo.title]);
  if (f.wheel) rows.push(["Руль", wheelLabel(f.wheel)]);
  if (f.budget) rows.push(["Бюджет", f.budget]);
  if (f.condition) rows.push(["Состояние", f.condition]);
  if (f.city) rows.push(["Город", f.city]);
  rows.push(["Согласие на обработку ПДн", "дано"]);

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const ok = await deliverLead(ctx.api, { phone: f.phone ?? "", name, user: { id: user.id, username: user.username }, rows, car: f.car, source: "bot" });
  if (!ok && (config.leadChatIds.length || config.leadApiUrl || config.smtp.host)) {
    f.consent = false;
    return ctx.reply(T.leadFailed);
  }
  s.leadSentAt = Date.now();
  s.form = {};
  const kb = new InlineKeyboard().url(T.btnToSite, brand.site).row().text(T.btnMenu, "menu");
  await ctx.reply(T.thanks, { reply_markup: kb });
  await sendLeadCard(ctx, s, rows, f.car);
});

// Карточка заявки у клиента — виджет Bot API 10.4 (в проде сейчас запрещён, тогда ничего не отправляется)
async function sendLeadCard(ctx: Context, s: Session, rows: [string, string][], car?: Car) {
  if (!widgetsAllowed) return;
  const short = (v: string) => (v.length > 34 ? `${v.slice(0, 33)}…` : v);
  const shown = rows.filter(([k]) => k !== "Согласие на обработку ПДн");
  if (car) shown.push(["Машина", car.title]);
  const data = { rows: shown.map(([k, v]) => [escapeHtml(k), escapeHtml(short(v))] as [string, string]), url: car ? similarUrl(car) : brand.site, step: 0 };
  try {
    const msg = await sendWidget(ctx.api, { chat_id: ctx.chat!.id, html: widgets.lead.html, height: 160 + shown.length * 34, chat_data: JSON.stringify(data) });
    s.leadCard = { messageId: msg.message_id, data };
  } catch (error) {
    console.warn("[widget] не отправился:", String(error));
    if (String(error).includes("WIDGET_NOT_ALLOWED")) widgetsAllowed = false;
  }
}

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

bot.catch((err) => console.error("[bot]", err.error));
