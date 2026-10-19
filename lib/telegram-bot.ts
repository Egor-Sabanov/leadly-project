import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isRecord } from "./request-guards";

export const TELEGRAM_COMMANDS = [
  { command: "start", description: "Открыть LEADLY и подключить аккаунт" },
  { command: "app", description: "Открыть приложение" },
  { command: "opportunities", description: "Возможности для заработка" },
  { command: "tasks", description: "Мои дела" },
  { command: "profile", description: "Мой профиль" },
  { command: "help", description: "Помощь" },
  { command: "privacy", description: "Обработка данных" },
  { command: "stop", description: "Отключить Telegram от LEADLY" },
];

export async function telegramBotReply(input: unknown, db: SupabaseClient, siteUrl: string, botUsername = "") {
  if (!isRecord(input) || !Number.isSafeInteger(input.update_id) || Number(input.update_id) < 0 || !isRecord(input.message)) return null;
  const message = input.message, chat = message.chat, sender = message.from;
  if (!Number.isSafeInteger(message.message_id) || Number(message.message_id) <= 0 || !isRecord(chat) || !isRecord(sender) || chat.type !== "private" || sender.is_bot === true ||
      !Number.isSafeInteger(chat.id) || Number(chat.id) <= 0 || chat.id !== sender.id || typeof message.text !== "string" || message.text.length > 4000) return null;
  const command = message.text.trim().match(/^\/(start|app|opportunities|tasks|profile|help|privacy|stop)(?:@([A-Za-z0-9_]{5,32}))?(?:\s+(\S+))?$/);
  if (!command) return null;
  if (command[2] && botUsername && command[2].toLowerCase() !== botUsername.toLowerCase()) return null;
  const name = command[1], payload = command[3];
  const destination = name === "opportunities" ? "/opportunities" : name === "tasks" ? "/tasks" : name === "profile" ? "/profile" : "/";
  const mini = new URL("/telegram", siteUrl); mini.searchParams.set("next", destination);
  const reply = (text: string, appButton = true) => ({ method: "sendMessage", chat_id: chat.id, text,
    ...(appButton ? { reply_markup: { inline_keyboard: [[{ text: "Открыть LEADLY", web_app: { url: mini.href } }]] } } : {}),
  });
  if (name === "start" && payload) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(payload)) return reply("Ссылка подключения недействительна. Создай новую в профиле LEADLY.", false);
    const username = typeof sender.username === "string" && /^[A-Za-z0-9_]{5,32}$/.test(sender.username) ? sender.username : null;
    const result = await db.rpc("leadly_claim_telegram_link", {
      p_token_hash: createHash("sha256").update(payload).digest("hex"),
      p_telegram_user_id: sender.id, p_username: username, p_chat_id: chat.id,
    });
    if (result.error) throw new Error("Telegram connection storage unavailable");
    return reply(result.data?.ok === true
      ? "Почти готово. Вернись в открытую вкладку LEADLY и подтверди Telegram в профиле. После этого здесь можно открывать свой рабочий кабинет."
      : "Ссылка истекла или уже использована. Создай новую в профиле LEADLY.");
  }
  if (name === "stop") {
    const result = await db.rpc("leadly_disconnect_telegram", { p_telegram_user_id: sender.id });
    if (result.error) throw new Error("Telegram connection storage unavailable");
    return reply("Telegram отключён от LEADLY. Новый вход через бота остановлен. Чтобы подключиться снова, открой профиль на сайте.", false);
  }
  if (name === "privacy") return reply(`При подключении сохраняются твой Telegram ID, имя пользователя и связь с аккаунтом LEADLY. Личные переписки и контакты бот не читает. Отключение: /stop. Подробнее: ${new URL("/privacy", siteUrl).href}`, false);
  if (name === "help") return reply("Открой приложение кнопкой ниже. Для первого входа подключи Telegram в профиле на сайте LEADLY и подтверди аккаунт.\n\n/opportunities — задания\n/tasks — мои дела\n/profile — профиль\n/stop — отключить Telegram");
  return reply(name === "tasks" ? "Твои дела — в приложении LEADLY." : name === "opportunities" ? "Русскоязычные задания и проекты — в приложении LEADLY." : name === "profile" ? "Настройки твоего аккаунта — в приложении LEADLY." : "LEADLY — твои возможности, отклики и дела в одном месте. Для первого входа подключи Telegram в профиле на сайте и подтверди свой аккаунт.");
}
