import type { SupabaseClient } from "@supabase/supabase-js";
import { isRecord, readLimitedJson } from "./request-guards";
import { parseTelegramChannelRules, type TelegramChannelRule } from "./telegram-channel-rules";
/** Operator-selected public channels. A URL alone never grants import access. */
export const selectedTelegramChannels = [{ username: "distantsiya", name: "Дистанция" }, { username: "designhunters", name: "Design Hunters" }];
export async function discoverTelegramSources(db: SupabaseClient, token: string, expectedBot: string, deadline: number, fetcher: typeof fetch = fetch) {
  async function call(method: string, body: object = {}) {
    if (Date.now() > deadline - 1000) throw new Error("Discovery unavailable");
    const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now()))) });
    const data = await readLimitedJson(response, 128000);
    return response.ok && isRecord(data) && data.ok === true ? data.result : null;
  }
  const me = await call("getMe");
  if (!isRecord(me) || me.is_bot !== true || typeof me.username !== "string" || me.username.toLowerCase() !== expectedBot.toLowerCase() || !Number.isSafeInteger(me.id) || Number(me.id) <= 0) throw new Error("Discovery unavailable");
  return Promise.all(selectedTelegramChannels.map(async channel => {
    async function disable() { const r = await db.from("opportunity_sources").update({ is_active: false }).eq("base_url", "https://t.me/" + channel.username).like("slug", "telegram-approved-%"); if (r.error) throw new Error(); }
    try {
      const chat = await call("getChat", { chat_id: "@" + channel.username });
      if (!isRecord(chat) || chat.type !== "channel" || typeof chat.username !== "string" || chat.username.toLowerCase() !== channel.username || !Number.isSafeInteger(chat.id) || !/^-100\d{4,20}$/.test(String(chat.id))) { await disable(); return { channel: channel.username, status: "unavailable" }; }
      const member = await call("getChatMember", { chat_id: chat.id, user_id: me.id });
      if (!isRecord(member) || !isRecord(member.user) || member.user.id !== me.id || member.user.is_bot !== true || !["administrator", "creator"].includes(String(member.status))) { await disable(); return { channel: channel.username, status: "access_required" }; }
      const saved = await db.from("opportunity_sources").upsert({ name: channel.name + " · Telegram", slug: "telegram-approved-" + String(chat.id).slice(1), base_url: "https://t.me/" + channel.username, source_type: "telegram", is_active: true }, { onConflict: "slug" });
      if (saved.error) throw new Error();
      return { channel: channel.username, status: "connected" };
    } catch { try { await disable(); } catch { /* Storage failure makes the webhook fail closed too. */ } return { channel: channel.username, status: "unavailable" }; }
  }));
}
export async function approvedTelegramRules(db: SupabaseClient, configured?: string, legacy?: string, legacyType?: string): Promise<(TelegramChannelRule & { sourceSlug?: string })[]> {
  const rules: (TelegramChannelRule & { sourceSlug?: string })[] = parseTelegramChannelRules(configured, legacy, legacyType);
  const result = await db.from("opportunity_sources").select("slug,base_url").eq("source_type", "telegram").eq("is_active", true).like("slug", "telegram-approved-%").limit(50);
  if (result.error) throw new Error("Telegram sources unavailable");
  for (const source of result.data || []) {
    const match = /^telegram-approved-(100\d{4,20})$/.exec(source.slug);
    const url = selectedTelegramChannels.find(item => source.base_url === "https://t.me/" + item.username);
    if (match && url && !rules.some(rule => rule.chatId === "-" + match[1])) rules.push({ chatId: "-" + match[1], type: "job", sourceSlug: source.slug });
  }
  return rules;
}
