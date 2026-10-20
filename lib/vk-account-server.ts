import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { accountApi } from "./account-api";
import { createSupabaseServerClient } from "./supabase/server";
import { isRecord, readLimitedJson, validUuid } from "./request-guards";
import { vkConfig } from "./vk-oauth";
import {
  VK_ACCOUNT_COOKIE,
  VK_RECEIPT_COOKIE,
  VK_ACCOUNT_SECONDS,
  vkPrivateHeaders,
  vkCookie,
  vkReceiptHash,
  vkSecureCookie,
  startVKAccountFlow,
  readVKAccountFlow,
  verifyVKAccountReturn,
} from "./vk-account-oauth";

export function vkAccountAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("VK unavailable");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(12000) }),
    },
  });
}
function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: vkPrivateHeaders });
}
function clear(response: Response, name: string) {
  response.headers.append("Set-Cookie", vkSecureCookie(name, "", 0));
  return response;
}
function back(site: string, path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { ...vkPrivateHeaders, Location: new URL(path, site).href },
  });
}

/** Same proof-to-session pattern as linked Telegram: the link is never mailed,
 * exposed to the browser, or consumed until its account ID has been checked. */
export async function signInLinkedVK(
  db: SupabaseClient,
  client: Pick<SupabaseClient, "auth">,
  vkId: string,
): Promise<"missing" | "signed_in" | "unavailable"> {
  if (!/^[1-9]\d{0,19}$/.test(vkId)) return "unavailable";
  const mapping = await db
    .from("vk_accounts")
    .select("user_id,vk_user_id")
    .eq("vk_user_id", vkId)
    .maybeSingle();
  if (mapping.error) return "unavailable";
  if (!mapping.data) return "missing";
  if (mapping.data.vk_user_id !== vkId || !validUuid(mapping.data.user_id))
    return "unavailable";
  const target = await db.auth.admin.getUserById(mapping.data.user_id);
  const user = target.data?.user;
  const extra = user as unknown as Record<string, unknown> | undefined;
  if (
    target.error ||
    !user ||
    user.id !== mapping.data.user_id ||
    !user.email ||
    !user.email_confirmed_at ||
    user.is_anonymous ||
    (typeof extra?.banned_until === "string" &&
      Date.parse(extra.banned_until) > Date.now()) ||
    extra?.deleted_at
  )
    return "unavailable";
  const link = await db.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });
  if (
    link.error ||
    link.data?.user?.id !== user.id ||
    typeof link.data.properties?.hashed_token !== "string" ||
    !/^[A-Za-z0-9_-]{16,512}$/.test(link.data.properties.hashed_token)
  )
    return "unavailable";
  const verified = await client.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  if (verified.error || verified.data.user?.id !== user.id) {
    if (verified.data.session) await client.auth.signOut({ scope: "local" });
    return "unavailable";
  }
  return "signed_in";
}

export async function vkAccountCallback(request: Request) {
  const config = vkConfig();
  if (!config) return json({ error: "Вход через VK пока недоступен." }, 503);
  const flow = readVKAccountFlow(request, config);
  let response = back(
    config.site,
    flow?.mode === "connect" ? "/profile?vk=error#vk" : "/auth?error=oauth",
  );
  try {
    if (!flow) return clear(response, VK_ACCOUNT_COOKIE);
    let actor: string | null = null;
    if (flow.mode === "connect") {
      const session = await accountApi(request);
      if (
        session.error ||
        !session.account.user.email_confirmed_at ||
        session.account.user.is_anonymous
      )
        return clear(
          back(config.site, "/auth?error=callback"),
          VK_ACCOUNT_COOKIE,
        );
      actor = session.account.user.id;
    }
    const proof = await verifyVKAccountReturn(request, config, actor);
    if (!proof) return clear(response, VK_ACCOUNT_COOKIE);
    const db = vkAccountAdmin();
    if (flow.mode === "connect") {
      const token = randomBytes(32).toString("base64url"),
        now = Date.now();
      const pending = await db
        .from("vk_link_requests")
        .upsert(
          {
            user_id: actor!,
            token_hash: vkReceiptHash(token),
            vk_user_id: proof.vkId,
            display_name: proof.name || "Профиль VK",
            created_at: new Date(now).toISOString(),
            expires_at: new Date(now + VK_ACCOUNT_SECONDS * 1000).toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (pending.error) return clear(response, VK_ACCOUNT_COOKIE);
      response = back(config.site, "/profile#vk");
      response.headers.append(
        "Set-Cookie",
        vkSecureCookie(VK_RECEIPT_COOKIE, token),
      );
    } else {
      const client = await createSupabaseServerClient();
      const result = await signInLinkedVK(db, client, proof.vkId);
      if (result === "signed_in") response = back(config.site, "/welcome");
      // Unmapped users retain the original Supabase sign-up/confirmation flow.
      // It owns its own independent state/verifier and does not trust this proof.
      else if (result === "missing")
        response = back(config.site, "/auth/social/vk?transport=provider");
    }
  } catch {
    /* Constant UI error; never log or reflect codes, tokens or email. */
  }
  return clear(response, VK_ACCOUNT_COOKIE);
}

export async function vkAccountStatus(request: Request) {
  const session = await accountApi(request);
  if (session.error) return session.error;
  if (!vkConfig()) return json({ available: false });
  try {
    const db = vkAccountAdmin(),
      actor = session.account.user.id;
    const connection = await db
      .from("vk_accounts")
      .select("display_name,linked_at,vk_user_id")
      .eq("user_id", actor)
      .maybeSingle();
    if (connection.error) return json({ available: false });
    const token = vkCookie(request, VK_RECEIPT_COOKIE);
    let pending = null;
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
      const result = await db
        .from("vk_link_requests")
        .select("display_name,expires_at,vk_user_id")
        .eq("user_id", actor)
        .eq("token_hash", vkReceiptHash(token))
        .maybeSingle();
      if (
        !result.error &&
        result.data &&
        Date.parse(result.data.expires_at) > Date.now()
      )
        pending = result.data;
    }
    const safe = (row: { display_name: string; vk_user_id: string }) => ({
      name: row.display_name,
      profileUrl: `https://vk.ru/id${row.vk_user_id}`,
    });
    return json({
      available: true,
      connection: connection.data
        ? { ...safe(connection.data), linkedAt: connection.data.linked_at }
        : null,
      pending: pending
        ? { ...safe(pending), expiresAt: pending.expires_at }
        : null,
      confirmedEmail: !!session.account.user.email_confirmed_at,
    });
  } catch {
    return json({ error: "Не удалось проверить подключение VK." }, 503);
  }
}

export async function vkAccountChange(
  request: Request,
  action: "start" | "confirm" | "remove",
) {
  const session = await accountApi(request, true);
  if (session.error) return session.error;
  const config = vkConfig(),
    user = session.account.user;
  if (!config) return json({ error: "Подключение VK пока недоступно." }, 503);
  if (!user.email || !user.email_confirmed_at || user.is_anonymous)
    return json(
      { error: "Сначала подтверди почту своего аккаунта LEADLY." },
      403,
    );
  try {
    const body = await readLimitedJson(request, 1000);
    if (!isRecord(body)) return json({ error: "Некорректный запрос." }, 400);
    const db = vkAccountAdmin();
    if (action === "start") {
      if (body.intent !== true)
        return json({ error: "Подтверди, что хочешь подключить VK." }, 400);
      const existing = await db
        .from("vk_accounts")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing.error)
        return json({ error: "Подключение VK пока недоступно." }, 503);
      if (existing.data)
        return json(
          { error: "Сначала отключи текущий VK, чтобы подключить другой." },
          409,
        );
      const start = startVKAccountFlow(config, "connect", user.id);
      const result = clear(json({ url: start.url }), VK_RECEIPT_COOKIE);
      result.headers.append("Set-Cookie", start.cookie);
      return result;
    }
    if (action === "confirm") {
      if (body.acknowledged !== true)
        return json({ error: "Отметь согласие на вход через этот VK." }, 400);
      const token = vkCookie(request, VK_RECEIPT_COOKIE);
      if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        return json(
          { error: "Подтверждение устарело. Подключи VK ещё раз." },
          410,
        );
      const result = await db.rpc("leadly_confirm_vk_link", {
        p_user_id: user.id,
        p_token_hash: vkReceiptHash(token),
        p_acknowledged: true,
      });
      if (result.error)
        return json({ error: "Не удалось сохранить подключение VK." }, 503);
      if (result.data?.ok !== true) {
        const messages: Record<string, string> = {
          expired: "Подтверждение устарело. Подключи VK ещё раз.",
          identity_in_use:
            "Этот VK связан с другим кабинетом LEADLY. Подключение не изменено.",
          already_connected: "К этому кабинету уже подключён другой VK.",
        };
        return json(
          {
            error:
              messages[result.data?.reason] ||
              "Этот VK уже подключён к другому аккаунту или сейчас недоступен.",
          },
          409,
        );
      }
      return clear(json({ ok: true }), VK_RECEIPT_COOKIE);
    }
    if (body.action === "cancel") {
      const result = await db
        .from("vk_link_requests")
        .delete()
        .eq("user_id", user.id);
      if (result.error)
        return json({ error: "Не удалось отменить подключение." }, 503);
    } else if (body.action === "disconnect" && body.acknowledged === true) {
      const result = await db.rpc("leadly_disconnect_vk", {
        p_user_id: user.id,
      });
      if (result.error || result.data?.ok !== true)
        return json({ error: "Не удалось отключить VK." }, 503);
    } else return json({ error: "Подтверди действие." }, 400);
    return clear(
      clear(json({ ok: true }), VK_RECEIPT_COOKIE),
      VK_ACCOUNT_COOKIE,
    );
  } catch {
    return json(
      { error: "Не удалось выполнить запрос. Попробуй ещё раз." },
      400,
    );
  }
}
