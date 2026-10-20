import type { RussianOpportunity } from "./russian-opportunities";
import { validUuid } from "./request-guards";
export type TelegramCardMessage = { html: string; opportunityIds: string[] };
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clean = (value: string | null, limit: number) => (value || "").replace(/<[^>]+>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
export function telegramJobCards(rows: RussianOpportunity[], reminders?: string): TelegramCardMessage | null {
  const jobs = rows.filter(row => validUuid(row.id)).slice(0, 3);
  if (!jobs.length && !reminders) return null;
  const cards = jobs.map((row, index) => {
    let source = "Источник задания";
    try { const url = new URL(row.source_url); source = url.hostname === "t.me" ? "Telegram · @" + url.pathname.split("/")[1] : url.hostname.replace(/^www\./, ""); } catch { /* No untrusted URL is emitted. */ }
    const amount = (value: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: /^[A-Z]{3}$/.test(row.currency_code) ? row.currency_code : "RUB", maximumFractionDigits: 0 }).format(value);
    const min = row.budget_min, max = row.budget_max;
    const budget = min !== null && Number.isFinite(min) && min > 0 ? max !== null && max >= min && max !== min ? amount(min) + " – " + amount(max) : amount(min) : max !== null && Number.isFinite(max) && max > 0 ? "до " + amount(max) : "Не указан";
    return `<b>${index + 1}. ${escape(clean(row.title, 150))}</b>\n💰 Бюджет: ${escape(budget)}\n📍 ${escape(source)}${row.remote ? " · удалённо" : ""}\n${escape(clean(row.description, 180))}`;
  });
  return { html: `<b>🔎 ${jobs.length ? "Новые задания в LEADLY" : "Твои дела в LEADLY"}</b>\n\n${cards.join("\n\n━━━━━━━━━━━━\n\n")}${rows.length > 3 ? "\n\nБольше новых заданий — в приложении." : ""}${reminders ? "\n\n" + escape(reminders) : ""}\n\nНастройки сообщений — в профиле.`, opportunityIds: jobs.map(row => row.id) };
}
