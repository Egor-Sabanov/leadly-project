import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authCookieOptions } from "@/lib/auth-cookies";
import { verifyTelegramInitData } from "@/lib/telegram-init-data";
import { telegramAdmin, telegramJson } from "@/lib/telegram-server";
import { isRecord, readLimitedJson, sameOrigin } from "@/lib/request-guards";
import { cookies } from "next/headers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.getUser();
    return telegramJson({ authenticated: !error && !!data.user }, !error && data.user ? 200 : 401);
  } catch { return telegramJson({ authenticated: false }, 503); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return telegramJson({ error: "Открой приложение через Telegram." }, 403);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return telegramJson({ error: "Вход через Telegram пока недоступен. Можно войти на сайте LEADLY." }, 503);
  let input;
  try { input = await readLimitedJson(request, 20000); }
  catch (error) { return telegramJson({ error: "Некорректный запрос." }, error instanceof RangeError ? 413 : 400); }
  if (!isRecord(input) || !["check", "login"].includes(String(input.action)))
    return telegramJson({ error: "Выбери вход в Telegram." }, 400);
  let identity;
  try { identity = verifyTelegramInitData(isRecord(input) ? input.initData : null, token); }
  catch (error) { return telegramJson({ error: error instanceof Error ? error.message : "Вход не подтверждён." }, 401); }
  try {
    const db = telegramAdmin();
    const mapping = await db.from("telegram_accounts").select("user_id").eq("telegram_user_id", identity.id).maybeSingle();
    if (mapping.error) return telegramJson({ error: "Вход через Telegram временно недоступен." }, 503);
    if (!mapping.data) return telegramJson({ code: "not_linked", error: "Сначала подключи Telegram в профиле LEADLY и подтверди свой аккаунт." }, 409);
    const account = await db.auth.admin.getUserById(mapping.data.user_id);
    const user = account.data?.user;
    const bannedUntil = (user as { banned_until?: string } | undefined)?.banned_until;
    if (account.error || !user?.email || !user.email_confirmed_at || (bannedUntil && Date.parse(bannedUntil) > Date.now()))
      return telegramJson({ error: "Вход в этот аккаунт недоступен." }, 403);
    if (input.action === "check") {
      const current = await (await createSupabaseServerClient()).auth.getUser();
      return telegramJson({
        linked: true,
        label: identity.username ? `@${identity.username}` : `Telegram ${identity.id}`,
        authenticated: !current.error && current.data.user?.id === user.id,
      });
    }
    // Admin generateLink creates a one-time token without sending an email.
    // Its identity must still match the explicitly linked LEADLY user.
    const link = await db.auth.admin.generateLink({ type: "magiclink", email: user.email });
    if (link.error || link.data?.user?.id !== user.id || !link.data.properties?.hashed_token)
      return telegramJson({ error: "Не удалось подготовить вход. Попробуй ещё раз." }, 503);
    const store = await cookies();
    store.set("leadly-tg", "1", { ...authCookieOptions("https://telegram", true, true), maxAge: 30 * 24 * 60 * 60 });
    const client = await createSupabaseServerClient();
    const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
    if (verified.error || verified.data.user?.id !== user.id)
      return telegramJson({ error: "Не удалось завершить вход. Открой приложение заново." }, 503);
    return telegramJson({ ok: true });
  } catch { return telegramJson({ error: "Вход через Telegram временно недоступен." }, 503); }
}
