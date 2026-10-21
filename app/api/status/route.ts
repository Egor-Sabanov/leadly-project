import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { operationsStatus, type PublicOperationsStatus } from "@/lib/operations-status";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const snapshot = unstable_cache(async (): Promise<PublicOperationsStatus> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !publicKey)
    return { status: "unavailable", checkedAt: new Date().toISOString() };
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(7000) }) },
  });
  let authAvailable = false;
  try {
    const response = await fetch(new URL("/auth/v1/health", url), {
      headers: { apikey: publicKey }, redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    authAvailable = response.ok;
  } catch { /* The public status fails closed without exposing provider errors. */ }
  return operationsStatus(db, authAvailable);
}, ["leadly-public-operations-status-v1"], { revalidate: 30 });

export async function GET() {
  let body: PublicOperationsStatus;
  try { body = await snapshot(); }
  catch { body = { status: "unavailable", checkedAt: new Date().toISOString() }; }
  return Response.json(body, {
    status: body.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
  });
}
