import { isCronAuthorized } from "@/lib/sources/ingest-runtime";
import { isRecord, readLimitedJson } from "@/lib/request-guards";
import { parseTelegramChannelRules } from "@/lib/telegram-channel-rules";
import { setupTelegramWebhook } from "@/lib/telegram-webhook-setup";
import { telegramAdmin, telegramJson } from "@/lib/telegram-server";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  if (!isCronAuthorized(process.env.TELEGRAM_SETUP_SECRET, request.headers.get("authorization")))
    return telegramJson({ error: "Unauthorized" }, 401);
  try {
    const input = await readLimitedJson(request, 1000);
    if (!isRecord(input) || !["check", "apply"].includes(String(input.action)))
      return telegramJson({ error: "Choose check or apply" }, 400);
    const schema = await telegramAdmin().from("telegram_accounts").select("user_id").limit(1);
    if (schema.error) return telegramJson({ code: "migration_required", error: "Сначала примени миграцию 0007_telegram_accounts.sql." }, 503);
    const result = await setupTelegramWebhook({
      token: process.env.TELEGRAM_BOT_TOKEN || "",
      secret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
      siteUrl: process.env.LEADLY_SITE_URL || "",
      rules: parseTelegramChannelRules(process.env.TELEGRAM_CHANNEL_RULES, process.env.TELEGRAM_ALLOWED_CHAT_IDS, process.env.TELEGRAM_OPPORTUNITY_TYPE),
      apply: input.action === "apply",
      expectedUsername: process.env.TELEGRAM_BOT_USERNAME,
    });
    return telegramJson(result);
  } catch { return telegramJson({ error: "Не удалось настроить Telegram. Проверь токен, адрес приложения и доступ к выбранным каналам." }, 503); }
}
