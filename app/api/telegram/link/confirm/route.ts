import { accountApi } from "@/lib/account-api";
import { isRecord, readLimitedJson, validUuid } from "@/lib/request-guards";
import { telegramAdmin, telegramJson } from "@/lib/telegram-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await accountApi(request, true);
  if (auth.error) return auth.error;
  let body;
  try { body = await readLimitedJson(request, 1000); }
  catch { return telegramJson({ error: "Не удалось прочитать подтверждение." }, 400); }
  if (!isRecord(body) || !validUuid(body.requestId)) return telegramJson({ error: "Обнови подключение Telegram." }, 400);
  try {
    const result = await telegramAdmin().rpc("leadly_confirm_telegram_link", {
      p_user_id: auth.account!.user.id, p_request_id: body.requestId,
    });
    if (result.error) return telegramJson({ error: "Не удалось сохранить подключение." }, 503);
    if (result.data?.ok !== true) return telegramJson({ error: "Подключение истекло или недоступно. Создай новое и проверь аккаунт в Telegram." }, 409);
    return telegramJson({ ok: true });
  } catch { return telegramJson({ error: "Не удалось сохранить подключение." }, 503); }
}
