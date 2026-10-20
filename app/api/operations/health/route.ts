import { createClient } from "@supabase/supabase-js";
import { isCronAuthorized } from "@/lib/sources/ingest-runtime";
import { runtimeHealth } from "@/lib/runtime-health";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isCronAuthorized(process.env.CRON_SECRET, request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ healthy: false }, { status: 503, headers });
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
    const result = await db.from("leadly_runtime_runs").select("started_at,finished_at,status").order("started_at", { ascending: false }).limit(100);
    if (result.error) throw new Error();
    const health = runtimeHealth(result.data || []);
    return Response.json(health, { status: health.healthy ? 200 : 503, headers });
  } catch { return Response.json({ healthy: false }, { status: 503, headers }); }
}
