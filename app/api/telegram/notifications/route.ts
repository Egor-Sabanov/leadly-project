import { accountApi } from "@/lib/account-api";
import { isRecord, readLimitedJson } from "@/lib/request-guards";
import { telegramAdmin, telegramConfigured, telegramJson } from "@/lib/telegram-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await accountApi(request);
  if (auth.error) return auth.error;
  if (!telegramConfigured()) return telegramJson({ available: false });
  try {
    const db = telegramAdmin(), id = auth.account!.user.id;
    const connection = await db.from("telegram_accounts").select("user_id").eq("user_id", id).maybeSingle();
    if (connection.error) throw new Error();
    if (!connection.data) return telegramJson({ available: false });
    const [settings, last] = await Promise.all([
      db.from("telegram_notification_settings").select("opportunities_enabled,tasks_enabled,disabled_reason,opportunity_frequency").eq("user_id", id).maybeSingle(),
      db.from("telegram_notification_deliveries").select("status,finished_at,kind,error_code").eq("user_id", id).order("created_at", { ascending: false }).limit(1),
    ]);
    if (settings.error || last.error) throw new Error();
    return telegramJson({ available: true, settings: settings.data || { opportunities_enabled: false, tasks_enabled: false, disabled_reason: null, opportunity_frequency: "updates" }, latest: last.data?.[0] || null });
  } catch { return telegramJson({ error: "Не удалось загрузить настройки уведомлений. Попробуй позже." }, 503); }
}
export async function POST(request: Request) {
  const auth = await accountApi(request, true);
  if (auth.error) return auth.error;
  if (!telegramConfigured()) return telegramJson({ error: "Уведомления Telegram пока недоступны." }, 503);
  let body: unknown;
  try { body = await readLimitedJson(request, 1000); }
  catch { return telegramJson({ error: "Не удалось прочитать настройки уведомлений." }, 400); }
  if (!isRecord(body) || typeof body.opportunities !== "boolean" || typeof body.tasks !== "boolean" || (body.frequency !== undefined && !["daily", "updates"].includes(String(body.frequency))) || ((body.opportunities || body.tasks) && body.consent !== true)) return telegramJson({ error: "Выбери уведомления, которые хочешь получать, и сохрани настройки." }, 400);
  try {
    const result = await telegramAdmin().rpc("leadly_set_telegram_notifications", { p_user_id: auth.account!.user.id, p_opportunities: body.opportunities, p_tasks: body.tasks, p_frequency: body.frequency === "updates" ? "updates" : "daily" });
    if (result.error) throw new Error();
    if (result.data?.ok !== true) return telegramJson({ error: "Сначала подключи Telegram и подтверди свой аккаунт." }, 409);
    return telegramJson({ ok: true });
  } catch { return telegramJson({ error: "Не удалось сохранить уведомления. Попробуй ещё раз." }, 503); }
}
