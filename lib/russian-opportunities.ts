import type { SupabaseClient } from "@supabase/supabase-js";
import { isRussianOpportunity } from "./opportunity-language";
export type RussianOpportunity = {
  id: string;
  title: string;
  company_name: string | null;
  description: string | null;
  source_url: string;
  category: string | null;
  location: string | null;
  remote: boolean;
  budget_min: number | null;
  budget_max: number | null;
  currency_code: string;
  competition: string;
  published_at: string | null;
  discovered_at: string;
  type: string;
  raw_metadata: unknown;
  expires_at: string | null;
};
export async function loadRussianOpportunities(
  supabase: SupabaseClient<any, "public", "public", any, any>,
  limit = 100,
) {
  const data: RussianOpportunity[] = [];
  let scanned = 0;
  for (let page = 0; page < 5 && data.length < limit; page++) {
    const response = await supabase
      .from("opportunities")
      .select(
        "id,title,company_name,description,source_url,category,location,remote,budget_min,budget_max,currency_code,competition,published_at,discovered_at,type,raw_metadata,expires_at",
      )
      .eq("is_active", true)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("discovered_at", { ascending: false })
      .range(page * 100, page * 100 + 99);
    if (response.error)
      return {
        data: [] as RussianOpportunity[],
        error: response.error,
        scanned,
      };
    const rows = (response.data || []) as RussianOpportunity[];
    scanned += rows.length;
    data.push(...rows.filter(isRussianOpportunity));
    if (rows.length < 100) break;
  }
  return { data: data.slice(0, limit), error: null, scanned };
}
