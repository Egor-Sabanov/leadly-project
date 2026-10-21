import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { telegramWorkspace, type WorkspaceCommand } from "./telegram-workspace";
import { isRecord } from "./request-guards";
import { telegramNotificationPanel } from "./telegram-notification-buttons";

export const TELEGRAM_COMMANDS = [
  { command: "start", description: "Открыть LEADLY и подключить аккаунт" },
  { command: "app", description: "Открыть приложение" },
  { command: "opportunities", description: "Задания по моему профилю" },
  { command: "saved", description: "Сохранённые задания" },
  { command: "projects", description: "Мои проекты и отклики" },
  { command: "today", description: "Дела на сегодня и просроченные" },
  { command: "tasks", description: "Ближайшие дела" },
  { command: "profile", description: "Мой профиль" },
  { command: "notifications", description: "Настроить уведомления" },
  { command: "quiet", description: "Выключить уведомления" },
  { command: "help", description: "Помощь" },
  { command: "privacy", description: "Обработка данных" },
  { command: "stop", description: "Отключить Telegram от LEADLY" },
];

export const TELEGRAM_MENU_ACTIONS: Readonly<Record<string, string>> = {
  "🔎 Задания": "opportunities",
  "📌 Сохранённое": "saved",
  "💼 Проекты": "projects",
  "📅 Сегодня": "today",
  "✅ Мои дела": "tasks",
  "👤 Профиль": "profile",
  "📱 LEADLY": "app",
  "ℹ️ Помощь": "help",
  "🔔 Уведомления": "notifications",
  "🔕 Тишина": "quiet",
  "Меню": "help",
  "меню": "help",
  "Помощь": "help",
};
function miniUrl(site: string, next: string) {
  const url = new URL("/telegram", site);
  url.searchParams.set("next", next);
  return url.href;
}
export function telegramMenu(site: string) {
  return {
    keyboard: [
      [{ text: "🔎 Задания" }, { text: "📌 Сохранённое" }],
      [{ text: "💼 Проекты" }, { text: "📅 Сегодня" }],
      [{ text: "✅ Мои дела" }, { text: "👤 Профиль", web_app: { url: miniUrl(site, "/profile") } }],
      [{ text: "📱 LEADLY", web_app: { url: miniUrl(site, "/") } }, { text: "ℹ️ Помощь" }],
      [{ text: "🔔 Уведомления" }, { text: "🔕 Тишина" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Выбери действие LEADLY",
  };
}
/** Telegram HTML is generated only after escaping all user/source content. */
export function telegramRichText(value: string) {
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = value.split("\n");
  return lines.map((line, i) => i === 0 && lines.length > 1 && line.length < 100 ? `<b>${escape(line)}</b>` : escape(line)).join("\n");
}

export async function telegramBotReply(input: unknown, db: SupabaseClient, siteUrl: string, botUsername = "") {
  if (!isRecord(input) || !Number.isSafeInteger(input.update_id) || Number(input.update_id) < 0 || !isRecord(input.message)) return null;
  const message = input.message, chat = message.chat, sender = message.from;
  if (!Number.isSafeInteger(message.message_id) || Number(message.message_id) <= 0 || !isRecord(chat) || !isRecord(sender) || chat.type !== "private" || sender.is_bot === true ||
      !Number.isSafeInteger(chat.id) || Number(chat.id) <= 0 || chat.id !== sender.id || typeof message.text !== "string" || message.text.length > 4000) return null;
  const text = message.text.trim();
  const shortcut = Object.hasOwn(TELEGRAM_MENU_ACTIONS, text) ? TELEGRAM_MENU_ACTIONS[text] : null;
  const command = shortcut ? [text, shortcut] : text.match(/^\/(start|app|opportunities|saved|projects|today|tasks|profile|notifications|quiet|help|privacy|stop)(?:@([A-Za-z0-9_]{5,32}))?(?:\s+(\S+))?$/);
  if (!command) return null;
  if (command[2] && botUsername && command[2].toLowerCase() !== botUsername.toLowerCase()) return null;
  const name = command[1], payload = command[3];
  const destination = name === "opportunities" ? "/opportunities" : name === "saved" ? "/opportunities?saved=1&scope=all" : name === "projects" ? "/crm" : name === "tasks" || name === "today" ? "/tasks" : name === "profile" ? "/profile" : name === "notifications" ? "/profile#telegram" : "/";
  const labels: Record<string, string> = { opportunities: "🔎 Открыть задания", saved: "📌 Открыть сохранённое", projects: "💼 Открыть проекты", tasks: "✅ Открыть мои дела", today: "📅 Открыть мои дела", profile: "👤 Открыть профиль", notifications: "🔔 Настроить уведомления" };
  const reply = (body: string, appButton = true, menu = false) => ({ method: "sendMessage", chat_id: chat.id, text: telegramRichText(body), parse_mode: "HTML", link_preview_options: { is_disabled: true },
    ...(menu ? { reply_markup: telegramMenu(siteUrl) } : appButton ? { reply_markup: { inline_keyboard: [[{ text: labels[name] || "📱 Открыть LEADLY", web_app: { url: miniUrl(siteUrl, destination) } }]] } } : {}),
  });
  if (name === "start" && payload && payload !== "menu") {
    if (!/^[A-Za-z0-9_-]{43}$/.test(payload)) return reply("⏳ Ссылка подключения недействительна. Создай новую в профиле LEADLY.", false);
    const username = typeof sender.username === "string" && /^[A-Za-z0-9_]{5,32}$/.test(sender.username) ? sender.username : null;
    const result = await db.rpc("leadly_claim_telegram_link", {
      p_token_hash: createHash("sha256").update(payload).digest("hex"),
      p_telegram_user_id: sender.id, p_username: username, p_chat_id: chat.id,
    });
    if (result.error) throw new Error("Telegram connection storage unavailable");
    return reply(result.data?.ok === true
      ? "🔗 Почти готово\n\nВернись в открытую вкладку LEADLY и подтверди Telegram в профиле. Затем выбирай задания, проекты и дела кнопками ниже."
      : "⏳ Ссылка истекла или уже использована. Создай новую в профиле LEADLY.", true, result.data?.ok === true);
  }
  if (name === "quiet") {
    const mapping = await db.from("telegram_accounts").select("user_id,chat_id").eq("telegram_user_id", sender.id).maybeSingle();
    if (mapping.error) throw new Error("Telegram storage unavailable");
    if (!mapping.data) return reply("🔗 Сначала подключи свой аккаунт в профиле LEADLY.", true, true);
    if (mapping.data.chat_id !== sender.id) throw new Error("Invalid Telegram recipient");
    const result = await db.rpc("leadly_set_telegram_notifications", { p_user_id: mapping.data.user_id, p_opportunities: false, p_tasks: false });
    if (result.error || result.data?.ok !== true) throw new Error("Telegram settings unavailable");
    return reply("🔕 Автоматические уведомления выключены\n\nВход в LEADLY и кнопки бота продолжают работать. Включить задания снова можно здесь, кнопкой «🔔 Уведомления». Напоминания о делах — в профиле.", true, true);
  }
  if (name === "notifications") return { ...reply("", false), ...await telegramNotificationPanel(db, Number(sender.id), siteUrl) };
  if (name === "stop") {
    const result = await db.rpc("leadly_disconnect_telegram", { p_telegram_user_id: sender.id });
    if (result.error) throw new Error("Telegram connection storage unavailable");
    return { ...reply("🔒 Telegram отключён от LEADLY\n\nНовый вход через бота и доступ к личным данным остановлены. Чтобы подключиться снова, открой профиль на сайте.", false), reply_markup: { remove_keyboard: true } };
  }
  if (["opportunities", "saved", "projects", "today", "tasks"].includes(name)) {
    try { return reply(await telegramWorkspace(name as WorkspaceCommand, db, sender.id as number)); }
    catch { return reply("⏳ Не удалось загрузить данные\n\nПопробуй кнопку позже или открой приложение."); }
  }
  if (name === "privacy") return reply(`🔒 Твои данные\n\nПри подключении сохраняются твой Telegram ID, имя пользователя и связь с аккаунтом LEADLY. Личные переписки и контакты бот не читает.\n\nОтключение: /stop. Подробнее: ${new URL("/privacy", siteUrl).href}`, false);
  if (name === "help") return reply("💼 Рабочее меню LEADLY\n\n🔎 Задания — подборка по профилю или общая лента.\n📌 Сохранённое — задания, которые ты отметил.\n💼 Проекты — отклики, ответы и переговоры.\n📅 Сегодня — дела на сегодня и просроченные.\n✅ Мои дела — ближайшие незавершённые задачи.\n👤 Профиль — навыки и настройки аккаунта.\n🔔 Уведомления — подборки и напоминания.\n🔕 Тишина — выключить автоматические сообщения.\n\nВыбирай кнопками ниже — вводить команды не нужно. Если меню скрыто, нажми значок клавиатуры рядом с полем сообщения.\n\nДля первого входа подключи Telegram в профиле на сайте. Отключить связь можно там же или командой /stop.", true, true);
  if (name === "profile") return reply("👤 Твой профиль\n\nСпециализация, навыки и настройки аккаунта — в LEADLY.");
  if (name === "app") return reply("📱 Твой LEADLY\n\nЗадания, отклики, проекты и дела — в одном кабинете.");
  return reply("💼 LEADLY — от задания к работе\n\nНаходи подходящие задания, сохраняй интересное и веди проекты. Выбирай действие кнопками ниже.\n\nХочешь получать новые задания здесь? Нажми «🔔 Уведомления» и выбери удобный режим.\n\nЕсли открываешь LEADLY в Telegram впервые, подключи свой аккаунт в профиле на сайте.", true, true);
}
