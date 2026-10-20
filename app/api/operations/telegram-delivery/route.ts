import { isCronAuthorized } from "@/lib/sources/ingest-runtime";
import { telegramAdmin, telegramConfigured, telegramJson } from "@/lib/telegram-server";
import { dispatchTelegramNotificationBatches } from "@/lib/telegram-delivery";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
/** Fixed operator worker for retries or a future more frequent scheduler.
 * No recipient, message text or destination is accepted from the request. */
export async function POST(request: Request) {
  if (!isCronAuthorized(process.env.CRON_SECRET, request.headers.get("authorization"))) return telegramJson({ error: "Unauthorized" }, 401);
  if (!telegramConfigured()) return telegramJson({ error: "Delivery unavailable" }, 503);
  try {
    const deadline = Date.now() + 45000;
    const result = await dispatchTelegramNotificationBatches(telegramAdmin(deadline), { token: process.env.TELEGRAM_BOT_TOKEN!, botUsername: process.env.TELEGRAM_BOT_USERNAME!, site: process.env.LEADLY_SITE_URL || "", deadline });
    const ok = !result.pending && !result.failed && !result.uncertain;
    console.info(JSON.stringify({ event: "telegram_delivery_finished", ...result }));
    return telegramJson({ ok, ...result }, ok ? 200 : 502);
  } catch { return telegramJson({ error: "Delivery unavailable" }, 503); }
}
