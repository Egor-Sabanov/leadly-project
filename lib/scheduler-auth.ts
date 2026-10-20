import type { SupabaseClient } from "@supabase/supabase-js";
import { isCronAuthorized } from "./sources/ingest-runtime";
/** Machine-only, fixed-destination scheduler; no browser/account authorization. */
export async function ingestionAuthorized(request: Request, db: SupabaseClient) {
  if (isCronAuthorized(process.env.CRON_SECRET, request.headers.get("authorization"))) return true;
  const token = request.headers.get("x-leadly-scheduler-key");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  try { const result = await db.rpc("leadly_scheduler_authorized", { p_token: token }); return !result.error && result.data === true; }
  catch { return false; }
}
