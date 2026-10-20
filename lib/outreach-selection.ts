import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRussianOpportunities, type RussianOpportunity } from "./russian-opportunities";
import { isRussianOpportunity } from "./opportunity-language";
import { validUuid } from "./request-guards";

/** A card selected outside the first catalogue page must stay selectable.
 * Never silently substitute another customer's job when a link has expired. */
export async function loadOutreachSelection(db: SupabaseClient, requested: string | null, now = Date.now()) {
  const feed = await loadRussianOpportunities(db);
  if (feed.error) return { ...feed, selectedId: "", unavailable: false };
  const rows = [...feed.data];
  if (!requested) return { ...feed, data: rows, selectedId: rows[0]?.id || "", unavailable: false };
  if (!validUuid(requested)) return { ...feed, data: rows, selectedId: "", unavailable: true };
  if (!rows.some(row => row.id === requested)) {
    const result = await db.from("opportunities").select("id,title,company_name,description,source_url,category,location,remote,budget_min,budget_max,currency_code,competition,published_at,discovered_at,type,raw_metadata,expires_at").eq("id", requested).eq("is_active", true).maybeSingle();
    if (result.error) return { data: [] as RussianOpportunity[], error: result.error, selectedId: "", unavailable: false };
    const item = result.data as RussianOpportunity | null;
    if (!item || item.id !== requested || !isRussianOpportunity(item) || (item.expires_at && (!Number.isFinite(Date.parse(item.expires_at)) || Date.parse(item.expires_at) <= now)))
      return { ...feed, data: rows, selectedId: "", unavailable: true };
    rows.unshift(item);
  }
  return { ...feed, data: rows, selectedId: requested, unavailable: false };
}
