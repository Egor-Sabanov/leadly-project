import type { SupabaseClient } from "@supabase/supabase-js";
import { isRecord, readLimitedJson, validUuid } from "./request-guards";
import { telegramOpportunityRows } from "./telegram-workspace";
import { telegramRichText } from "./telegram-bot";
import { telegramJobCards, type TelegramCardMessage } from "./telegram-cards";

export type TelegramDeliveryConfig = { token: string; botUsername: string; site: string; deadline: number };
type Claim = { userId: string; id: string; lease: string; telegramId: number; fromAt: string; cutoffAt: string; slotDate: string; opportunities: boolean; tasks: boolean; kind: "daily" | "test" | "updates" };
type Outcome = "sent" | "empty" | "failed" | "uncertain" | "blocked" | "cancelled";
type SendResult = { outcome: Outcome; error?: string; messageId?: number; retry?: number };
const clean = (value: unknown) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) : "";

export async function verifyTelegramDeliveryBot(config: TelegramDeliveryConfig, fetcher: typeof fetch = fetch) {
  const site = new URL(config.site);
  if (!/^\d+:[A-Za-z0-9_-]{20,100}$/.test(config.token) || !/^[A-Za-z0-9_]{5,32}$/.test(config.botUsername) || site.protocol !== "https:" || site.origin !== config.site || Date.now() >= config.deadline) throw new Error("Delivery unavailable");
  const response = await fetcher(`https://api.telegram.org/bot${config.token}/getMe`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(Math.max(1, Math.min(5000, config.deadline - Date.now()))) });
  const body = await readLimitedJson(response, 128000);
  if (!response.ok || !isRecord(body) || body.ok !== true || !isRecord(body.result) || body.result.is_bot !== true || typeof body.result.username !== "string" || body.result.username.toLowerCase() !== config.botUsername.toLowerCase()) throw new Error("Delivery unavailable");
}
function readClaim(value: unknown, kind: string, userId: string): Claim | null {
  if (!isRecord(value) || value.status !== "claimed" || value.userId !== userId || !validUuid(value.id) || !validUuid(value.lease) || !Number.isSafeInteger(value.telegramId) || Number(value.telegramId) <= 0 || value.kind !== kind || typeof value.opportunities !== "boolean" || typeof value.tasks !== "boolean" || typeof value.slotDate !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value.slotDate) || typeof value.fromAt !== "string" || typeof value.cutoffAt !== "string" || !Number.isFinite(Date.parse(value.fromAt)) || !Number.isFinite(Date.parse(value.cutoffAt)) || Date.parse(value.fromAt) > Date.parse(value.cutoffAt)) return null;
  return value as unknown as Claim;
}
export async function telegramDigest(db: SupabaseClient, userId: string, claim: Claim) {
  if (claim.kind === "test") return "🔔 Проверка уведомлений LEADLY\n\nСообщение доставлено в твой Telegram. Здесь будут появляться выбранные тобой подборки и напоминания. Настройки можно изменить в профиле; кнопка «Тишина» отключает автоматические сообщения.";
  const sections: string[] = [];
  let newJobs: Awaited<ReturnType<typeof telegramOpportunityRows>>["rows"] = [];
  if (claim.opportunities) {
    const profile = await db.from("profiles").select("headline,skills_summary,onboarding_completed,timezone").eq("id", userId).maybeSingle();
    if (profile.error) throw new Error("Content unavailable");
    const result = await telegramOpportunityRows(db, userId, profile.data);
    const rows = result.rows.filter(row => Date.parse(row.discovered_at) > Date.parse(claim.fromAt) && Date.parse(row.discovered_at) <= Date.parse(claim.cutoffAt));
    newJobs = rows;
  }
  if (claim.tasks) {
    const result = await db.from("follow_ups").select("note,scheduled_for").eq("user_id", userId).is("completed_at", null).lt("scheduled_for", claim.slotDate + "T23:59:59.999Z").order("scheduled_for").limit(4);
    if (result.error) throw new Error("Content unavailable");
    if (result.data?.length) sections.push("📅 Дела на сегодня и просроченные\n" + result.data.slice(0, 3).map(row => "• " + (clean(row.note) || "Связаться с клиентом") + " — " + String(row.scheduled_for).slice(0, 10)).join("\n") + (result.data.length > 3 ? "\nОстальные дела — в приложении." : ""));
  }
  return telegramJobCards(newJobs, sections.join("\n\n"));
}
async function sendMessage(config: TelegramDeliveryConfig, claim: Claim, text: string | TelegramCardMessage, fetcher: typeof fetch): Promise<SendResult> {
  try {
    const mini = (next: string) => { const url = new URL("/telegram", config.site); url.searchParams.set("next", next); return url.href; };
    const response = await fetcher(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(Math.max(1, Math.min(8000, config.deadline - Date.now()))), headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: claim.telegramId, text: typeof text === "string" ? telegramRichText(text) : text.html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [...(typeof text === "string" ? [] : text.opportunityIds.map((id, index) => [{ text: `Открыть задание ${index + 1}`, web_app: { url: mini(`/opportunities/${id}`) } }])), [{ text: "🔎 Все задания", web_app: { url: mini("/opportunities") } }, { text: "📅 Мои дела", web_app: { url: mini("/tasks") } }], [{ text: "🔔 Настройки", web_app: { url: mini("/profile#telegram") } }]] } }),
    });
    const body = await readLimitedJson(response, 128000);
    if (isRecord(body) && body.ok === true && response.ok && isRecord(body.result) && Number.isSafeInteger(body.result.message_id) && Number(body.result.message_id) > 0 && isRecord(body.result.chat) && body.result.chat.id === claim.telegramId) return { outcome: "sent", messageId: Number(body.result.message_id) };
    if (isRecord(body) && body.ok === false) {
      if (body.error_code === 403) return { outcome: "blocked", error: "blocked" };
      if (body.error_code === 429) return { outcome: "failed", error: "rate_limit", retry: Math.min(86400, Math.max(1, isRecord(body.parameters) && Number.isSafeInteger(body.parameters.retry_after) ? Number(body.parameters.retry_after) : 60)) };
      if (typeof body.error_code === "number" && body.error_code >= 500) return { outcome: "failed", error: "rejected", retry: 60 };
      if (typeof body.error_code === "number" && body.error_code >= 400 && body.error_code < 500) return { outcome: "cancelled", error: "rejected" };
    }
    return { outcome: "uncertain", error: "network_unknown" };
  } catch { return { outcome: "uncertain", error: "network_unknown" }; }
}

/** Caller verifies getMe once per batch or explicit test request. No token or
 * message content is stored/logged. A network-ambiguous send is never retried. */
export async function processTelegramDelivery(db: SupabaseClient, userId: string, kind: "daily" | "test" | "updates", config: TelegramDeliveryConfig, fetcher: typeof fetch = fetch, build: (db: SupabaseClient, id: string, claim: Claim) => Promise<string | TelegramCardMessage | null> = telegramDigest) {
  if (!validUuid(userId) || Date.now() > config.deadline - 2500) return "deferred";
  const reserved = await db.rpc("leadly_claim_telegram_delivery", { p_user_id: userId, p_kind: kind });
  if (reserved.error) return "failed";
  if (reserved.data?.status === "deferred") return "not_due";
  if (reserved.data?.status === "sent" || reserved.data?.status === "empty") return "already_" + reserved.data.status;
  if (reserved.data?.status !== "claimed") return ["sent", "empty", "uncertain", "failed", "disabled", "cancelled", "prepared", "sending", "unavailable", "retry_wait"].includes(reserved.data?.status) ? String(reserved.data.status) : "failed";
  const claim = readClaim(reserved.data, kind, userId);
  if (!claim) return "failed";
  const finish = async (result: SendResult) => {
    const ack = await db.rpc("leadly_finish_telegram_delivery", { p_id: claim.id, p_lease: claim.lease, p_result: result.outcome, p_error: result.error || null, p_message_id: result.messageId || null, p_retry_seconds: result.retry || 60 });
    return !ack.error && ack.data === true ? result.outcome : "uncertain";
  };
  let text: string | TelegramCardMessage | null;
  try { text = await build(db, userId, claim); }
  catch { return finish({ outcome: "failed", error: "content_unavailable" }); }
  if (!text) return finish({ outcome: "empty" });
  if (Date.now() > config.deadline - 2500) return finish({ outcome: "failed", error: "content_unavailable" });
  const begin = await db.rpc("leadly_begin_telegram_send", { p_id: claim.id, p_lease: claim.lease });
  if (begin.error) return finish({ outcome: "failed", error: "content_unavailable" });
  if (begin.data !== true) return "cancelled";
  if (Date.now() > config.deadline - 1000) return finish({ outcome: "failed", error: "content_unavailable" });
  return finish(await sendMessage(config, claim, text, fetcher));
}
export async function dispatchTelegramNotifications(db: SupabaseClient, config: TelegramDeliveryConfig, fetcher: typeof fetch = fetch, kind: "daily" | "updates" = "daily") {
  const summary = { sent: 0, empty: 0, failed: 0, uncertain: 0, blocked: 0, pending: 0 };
  let selection = db.from("telegram_notification_settings").select("user_id", { count: "exact" });
  selection = kind === "updates" ? selection.eq("opportunities_enabled", true).eq("opportunity_frequency", "updates") : selection.or("tasks_enabled.eq.true,and(opportunities_enabled.eq.true,opportunity_frequency.eq.daily)");
  const candidates = await selection.order("last_checked_at", { ascending: true, nullsFirst: true }).limit(200);
  if (candidates.error) throw new Error("Delivery unavailable");
  const rows = candidates.data || [];
  if (!rows.length) return summary;
  await verifyTelegramDeliveryBot(config, fetcher);
  let next = 0, completed = 0;
  const work = async () => {
    while (next < rows.length && Date.now() < config.deadline - 3000) {
      const item = rows[next++];
      let result: string;
      try { result = await processTelegramDelivery(db, item.user_id, kind, config, fetcher); }
      catch { result = "failed"; }
      if (result === "deferred") break;
      completed++;
      if (result === "sent" || result === "empty" || result === "failed" || result === "uncertain" || result === "blocked") summary[result]++;
      else if (result === "prepared" || result === "sending" || result === "retry_wait") summary.pending++;
    }
  };
  await Promise.all([work(), work()]);
  summary.pending += Math.max(0, (candidates.count || rows.length) - completed);
  return summary;
}

export async function dispatchTelegramNotificationBatches(db: SupabaseClient, config: TelegramDeliveryConfig, fetcher: typeof fetch = fetch) {
  const result = { sent: 0, empty: 0, failed: 0, uncertain: 0, blocked: 0, pending: 0 };
  for (const kind of ["updates", "daily"] as const) {
    try { const part = await dispatchTelegramNotifications(db, config, fetcher, kind); for (const key of Object.keys(result) as (keyof typeof result)[]) result[key] += part[key]; }
    catch { result.failed++; }
  }
  return result;
}
