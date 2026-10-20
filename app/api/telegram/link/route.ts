import { createHash, randomBytes, randomUUID } from "node:crypto";
import { accountApi } from "@/lib/account-api";
import { telegramAdmin, telegramConfigured, telegramJson } from "@/lib/telegram-server";
import { isRecord, readLimitedJson } from "@/lib/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await accountApi(request);
  if (auth.error) return auth.error;
  if (!telegramConfigured()) return telegramJson({ available: false });
  try {
    const db = telegramAdmin();
    const [connection, pending] = await Promise.all([
      db.from("telegram_accounts").select("telegram_username,linked_at").eq("user_id", auth.account!.user.id).maybeSingle(),
      db.from("telegram_link_requests").select("id,expires_at,telegram_user_id,telegram_username").eq("user_id", auth.account!.user.id).gt("expires_at", new Date().toISOString()).maybeSingle(),
    ]);
    if (connection.error || pending.error) return telegramJson({ available: false });
    return telegramJson({ available: true, connection: connection.data, pending: pending.data });
  } catch { return telegramJson({ error: "Не удалось проверить Telegram. Попробуй ещё раз." }, 503); }
}

export async function POST(request: Request) {
  const auth = await accountApi(request, true);
  if (auth.error) return auth.error;
  if (!telegramConfigured()) return telegramJson({ error: "Telegram пока не подключён." }, 503);
  if (!auth.account!.user.email_confirmed_at) return telegramJson({ error: "Подтверди почту в разделе «Настройки», чтобы входить в этот кабинет через Telegram." }, 409);
  try {
    const consent = await readLimitedJson(request, 1000);
    if (!isRecord(consent) || consent.consent !== true) return telegramJson({ error: "Подтверди подключение Telegram как способа входа." }, 400);
  } catch { return telegramJson({ error: "Подтверди подключение Telegram." }, 400); }
  try {
    const db = telegramAdmin(), userId = auth.account!.user.id;
    const connection = await db.from("telegram_accounts").select("user_id").eq("user_id", userId).maybeSingle();
    if (connection.error) return telegramJson({ error: "Подключение Telegram пока недоступно." }, 503);
    if (connection.data) return telegramJson({ error: "Telegram уже подключён. Сначала отключи прежний аккаунт." }, 409);
    const token = randomBytes(32).toString("base64url");
    const createdAt = new Date(), expiresAt = new Date(createdAt.getTime() + 5 * 60_000).toISOString();
    const result = await db.from("telegram_link_requests").upsert({
      id: randomUUID(), user_id: userId, token_hash: createHash("sha256").update(token).digest("hex"),
      created_at: createdAt.toISOString(), expires_at: expiresAt,
      telegram_user_id: null, telegram_username: null, chat_id: null,
    }, { onConflict: "user_id" });
    if (result.error) return telegramJson({ error: "Не удалось создать подключение. Попробуй ещё раз." }, 503);
    return telegramJson({ url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${token}`, expiresAt });
  } catch { return telegramJson({ error: "Не удалось создать подключение. Попробуй ещё раз." }, 503); }
}

export async function DELETE(request: Request) {
  const auth = await accountApi(request, true);
  if (auth.error) return auth.error;
  try {
    const result = await telegramAdmin().rpc("leadly_disconnect_telegram", { p_user_id: auth.account!.user.id });
    if (result.error || result.data?.ok !== true) return telegramJson({ error: "Не удалось отключить Telegram." }, 503);
    return telegramJson({ ok: true });
  } catch { return telegramJson({ error: "Не удалось отключить Telegram." }, 503); }
}
