import type { SupabaseClient } from "@supabase/supabase-js";
import { runtimeHealth } from "./runtime-health";

export type PublicOperationsStatus = {
  status: "ok" | "degraded" | "unavailable";
  checkedAt: string;
};

/** Public liveness contains no account data, run IDs, counts or configuration. */
export async function operationsStatus(
  db: SupabaseClient,
  authAvailable: boolean,
  now = Date.now(),
): Promise<PublicOperationsStatus> {
  const checkedAt = new Date(now).toISOString();
  try {
    const [history, scheduler] = await Promise.all([
      db.from("leadly_runtime_runs")
        .select("started_at,finished_at,status")
        .order("started_at", { ascending: false }).limit(100),
      db.rpc("leadly_scheduler_status"),
    ]);
    if (!authAvailable || history.error || scheduler.error)
      return { status: "unavailable", checkedAt };
    const healthy = scheduler.data?.enabled === true &&
      scheduler.data?.schedule === "*/10 * * * *" &&
      runtimeHealth(history.data || [], now, 600000).healthy;
    return { status: healthy ? "ok" : "degraded", checkedAt };
  } catch {
    return { status: "unavailable", checkedAt };
  }
}
