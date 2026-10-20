import { accountApi } from "@/lib/account-api";
import { isRecord, readLimitedJson } from "@/lib/request-guards";
import { telegramAdmin, telegramConfigured, telegramJson } from "@/lib/telegram-server";
import { processTelegramDelivery, verifyTelegramDeliveryBot } from "@/lib/telegram-delivery";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const auth = await accountApi(request, true);
  if (auth.error) return auth.error;
  if (!telegramConfigured()) return telegramJson({ error: "Проверка уведомлений пока недоступна." }, 503);
  let body: unknown;
  try { body = await readLimitedJson(request, 500); }
  catch { return telegramJson({ error: "Не удалось прочитать запрос проверки." }, 400); }
  if (!isRecord(body) || body.send !== true) return telegramJson({ error: "Подтверди отправку одного проверочного сообщения в свой Telegram." }, 400);
  try {
    const config = { token: process.env.TELEGRAM_BOT_TOKEN!, botUsername: process.env.TELEGRAM_BOT_USERNAME!, site: process.env.LEADLY_SITE_URL || "", deadline: Date.now() + 45000 };
    await verifyTelegramDeliveryBot(config);
    const status = await processTelegramDelivery(telegramAdmin(config.deadline), auth.account!.user.id, "test", config);
    return telegramJson({ status });
  } catch { return telegramJson({ error: "Не удалось проверить доставку. Попробуй позже." }, 503); }
}
