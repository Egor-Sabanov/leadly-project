import { accountApi } from "@/lib/account-api";
import { validUuid } from "@/lib/request-guards";
import { telegramAdmin } from "@/lib/telegram-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  const access = await accountApi(request);
  if (access.error) return access.error;
  const user = access.account!.user;
  const allowed = (process.env.LEADLY_OPERATOR_USER_IDS || "").split(",").map(value => value.trim()).filter(validUuid);
  if (!allowed.includes(user.id)) return Response.json({ error: "Доступ только владельцу сервиса." }, { status: 403, headers });
  try {
    const result = await telegramAdmin().from("telegram_accounts")
      .select("telegram_user_id,chat_id").eq("user_id", user.id).maybeSingle();
    const mapping = result.data;
    if (result.error || !mapping || !Number.isSafeInteger(mapping.chat_id) || mapping.chat_id <= 0 || mapping.chat_id !== mapping.telegram_user_id)
      return Response.json({ error: "Подтверди Telegram в своём профиле." }, { status: 409, headers });
    return Response.json({ chatId: String(mapping.chat_id), bot: "leadly_work_bot" }, { headers });
  } catch {
    return Response.json({ error: "Не удалось получить настройки владельца." }, { status: 503, headers });
  }
}
