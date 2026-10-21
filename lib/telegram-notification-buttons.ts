import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isRecord, readLimitedJson, validUuid } from "./request-guards";

type Mode = "updates" | "daily" | "off";
type Owner = { userId: string; jobs: boolean; tasks: boolean; frequency: "updates" | "daily" };
type Button = { text: string; callback_data: string } | { text: string; web_app: { url: string } };
type Panel = { text: string; parse_mode: "HTML"; reply_markup: { inline_keyboard: Button[][] } };
export type NotificationCallback = {
  answer: { method: "answerCallbackQuery"; callback_query_id: string; text: string; show_alert: boolean };
  edit?: Panel & { chat_id: number; message_id: number };
};

const binding = (id: string) => createHash("sha256").update("leadly-job-notifications:" + id).digest("base64url").slice(0, 22);
function profileButton(site: string): Button {
  const url = new URL("/telegram", site); url.searchParams.set("next", "/profile#telegram");
  return { text: "⚙️ Профиль и напоминания", web_app: { url: url.href } };
}
async function readOwner(db: SupabaseClient, telegramId: number): Promise<Owner | null> {
  const linked = await db.from("telegram_accounts").select("user_id,chat_id").eq("telegram_user_id", telegramId).maybeSingle();
  if (linked.error) throw new Error("Telegram settings unavailable");
  if (!linked.data) return null;
  if (!validUuid(linked.data.user_id) || linked.data.chat_id !== telegramId) throw new Error("Invalid Telegram recipient");
  const settings = await db.from("telegram_notification_settings").select("opportunities_enabled,tasks_enabled,opportunity_frequency").eq("user_id", linked.data.user_id).maybeSingle();
  if (settings.error) throw new Error("Telegram settings unavailable");
  const s = settings.data;
  if (s && (typeof s.opportunities_enabled !== "boolean" || typeof s.tasks_enabled !== "boolean" || !["updates", "daily"].includes(s.opportunity_frequency))) throw new Error("Invalid Telegram settings");
  return { userId: linked.data.user_id, jobs: s?.opportunities_enabled === true, tasks: s?.tasks_enabled === true, frequency: s?.opportunity_frequency || "updates" };
}
function panel(owner: Owner | null, site: string): Panel {
  if (!owner) return { text: "<b>🔗 Подключи свой аккаунт</b>\n\nОткрой профиль LEADLY и подключи Telegram. После подтверждения можно включить задания прямо здесь, кнопкой «🔔 Уведомления».", parse_mode: "HTML", reply_markup: { inline_keyboard: [[profileButton(site)]] } };
  const mode: Mode = owner.jobs ? owner.frequency : "off";
  const current = mode === "updates" ? "🔔 Новые задания: после обновления ленты." : mode === "daily" ? "🗓 Новые задания: одной сводкой в день." : "🔕 Новые задания пока выключены.";
  const choices: [Mode, string][] = [["updates", "🔔 После обновления ленты"], ["daily", "🗓 Раз в день"], ["off", "🔕 Не присылать задания"]];
  return {
    text: "<b>🔔 Уведомления LEADLY</b>\n\n" + current + "\n\nХочешь получать новые задания в этом чате? Выбери удобный режим ниже. При заполненном профиле — подходящие тебе, без профиля — из общей ленты.\n\nЛента проверяется каждые 10 минут. Сообщение приходит, когда появились новые подходящие задания после включения. Ежедневная сводка — утром по твоему времени.\n\n📅 Напоминания о делах: " + (owner.tasks ? "включены." : "выключены.") + " Их можно изменить в профиле.\n\nОтключить все автоматические сообщения можно кнопкой «🔕 Тишина».",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [...choices.map(([value, text]) => [{ text: (mode === value ? "✓ " : "") + text, callback_data: "leadly:notify:" + value + ":" + binding(owner.userId) }]), [profileButton(site)]] },
  };
}
export async function telegramNotificationPanel(db: SupabaseClient, telegramId: number, site: string) {
  return panel(await readOwner(db, telegramId), site);
}

export async function telegramNotificationCallback(input: unknown, db: SupabaseClient, site: string, botUsername: string): Promise<NotificationCallback | null> {
  if (!isRecord(input) || !Number.isSafeInteger(input.update_id) || Number(input.update_id) < 0 || !isRecord(input.callback_query)) return null;
  const callback = input.callback_query, sender = callback.from, message = callback.message;
  if (typeof callback.id !== "string" || !callback.id || callback.id.length > 128 || /[\u0000-\u001f\u007f]/.test(callback.id) ||
    !isRecord(sender) || !Number.isSafeInteger(sender.id) || Number(sender.id) <= 0 || sender.is_bot === true || !isRecord(message) ||
    !Number.isSafeInteger(message.message_id) || Number(message.message_id) <= 0 || !isRecord(message.chat) || message.chat.type !== "private" || message.chat.id !== sender.id ||
    !isRecord(message.from) || message.from.is_bot !== true || typeof message.from.username !== "string" || !botUsername || message.from.username.toLowerCase() !== botUsername.toLowerCase() || typeof callback.data !== "string") return null;
  const data = /^leadly:notify:(updates|daily|off):([A-Za-z0-9_-]{22})$/.exec(callback.data);
  if (!data) return null;
  const answer = (text: string, show_alert = false): NotificationCallback => ({ answer: { method: "answerCallbackQuery", callback_query_id: callback.id as string, text, show_alert } });
  const owner = await readOwner(db, Number(sender.id));
  if (!owner || data[2] !== binding(owner.userId)) return answer("Кнопки устарели. Нажми «🔔 Уведомления» в меню бота.", true);
  const saved = await db.rpc("leadly_set_telegram_job_notifications", { p_user_id: owner.userId, p_frequency: data[1], p_update_id: input.update_id });
  if (saved.error) throw new Error("Telegram settings unavailable");
  if (saved.data?.ok !== true) return answer("Не удалось сохранить выбор. Проверь подключение и подтверждение почты в профиле LEADLY.", true);
  const current = await readOwner(db, Number(sender.id));
  if (!current || current.userId !== owner.userId) return answer("Подключение изменилось. Нажми «🔔 Уведомления» снова.", true);
  return { ...answer(current.jobs ? "Готово — новые задания будут приходить в выбранном режиме." : "Новые задания выключены. Настройки напоминаний сохранены."), edit: { ...panel(current, site), chat_id: Number(sender.id), message_id: Number(message.message_id) } };
}

/** Editing the same bot message is idempotent; no extra outbound message is sent. */
export async function applyTelegramNotificationEdit(result: NotificationCallback, token: string, fetcher: typeof fetch = fetch) {
  if (!result.edit) return result.answer;
  try {
    if (!/^\d+:[A-Za-z0-9_-]{20,100}$/.test(token)) throw new Error("Invalid bot configuration");
    const response = await fetcher(`https://api.telegram.org/bot${token}/editMessageText`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(6000), headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.edit) });
    const body = await readLimitedJson(response, 16000);
    if (response.ok && isRecord(body) && body.ok === true && isRecord(body.result) && body.result.message_id === result.edit.message_id && isRecord(body.result.chat) && body.result.chat.id === result.edit.chat_id) return result.answer;
    if (isRecord(body) && body.ok === false && body.error_code === 400 && typeof body.description === "string" && body.description.includes("message is not modified")) return result.answer;
  } catch { /* The preference is already committed; do not report an unsaved choice. */ }
  return { ...result.answer, text: "Выбор сохранён. Чтобы обновить кнопки, нажми «🔔 Уведомления» в меню бота.", show_alert: true };
}
