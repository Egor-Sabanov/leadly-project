import type { SupabaseClient } from "@supabase/supabase-js";
import { isRecord } from "./request-guards";

const headers = { "Cache-Control": "private, no-store" };
export async function trackedIngestion(db: SupabaseClient, id: string, operation: () => Promise<Response>) {
  const claim = await db.rpc("leadly_begin_runtime_run", { p_run_id: id });
  if (claim.error || claim.data?.ok !== true) return Response.json(
    claim.data?.busy === true ? { skipped: true, reason: "already_running" } : { error: "Не удалось начать обновление заданий." },
    { status: claim.data?.busy === true ? 202 : 503, headers },
  );
  let response: Response;
  let status = "failed";
  const summary: Record<string, number> = {};
  try {
    response = await operation();
    const body: unknown = await response.clone().json();
    if (isRecord(body)) {
      if (["completed", "partial", "failed"].includes(String(body.status))) status = String(body.status);
      for (const key of ["feedsProcessed", "feedsFailed", "imported", "skipped", "durationMs", "notificationsSent", "notificationsPending", "notificationsFailed", "notificationsUncertain"]) {
        if (Number.isSafeInteger(body[key]) && Number(body[key]) >= 0) summary[key] = Number(body[key]);
      }
    }
  } catch {
    response = Response.json({ error: "Обновление заданий прервано." }, { status: 503, headers });
  }
  // Persist only fixed counters, never source URLs, credentials or raw errors.
  const finished = await db.rpc("leadly_finish_runtime_run", { p_run_id: id, p_status: status, p_summary: summary });
  if (finished.error || finished.data !== true) return Response.json({ error: "Не удалось сохранить итог обновления." }, { status: 503, headers });
  return response;
}
export function runtimeHealth(rows: { started_at: string; finished_at: string | null; status: string }[], now = Date.now()) {
  const latest = rows[0];
  const success = rows.find(row => row.status === "completed" && row.finished_at);
  const successAt = success?.finished_at ? Date.parse(success.finished_at) : NaN;
  const running = latest?.status === "running" && now - Date.parse(latest.started_at) < 360000;
  const stale = !Number.isFinite(successAt) || now - successAt > 27 * 3600000 || successAt > now + 60000;
  return { healthy: !stale && (latest?.status === "completed" || running), stale, running, latestStatus: latest?.status || "never_run", lastSuccessAt: success?.finished_at || null };
}
