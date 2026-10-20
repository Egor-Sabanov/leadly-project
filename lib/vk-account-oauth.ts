import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { isRecord, validUuid, readLimitedJson } from "./request-guards";
import { openVKFlow, sealVKFlow, vkToken, type VKConfig } from "./vk-oauth";

export const VK_ACCOUNT_COOKIE = "__Host-leadly-vk-account";
export const VK_RECEIPT_COOKIE = "__Host-leadly-vk-confirm";
export const VK_ACCOUNT_SECONDS = 300;
export const vkPrivateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};
export type VKAccountFlow = {
  mode: "signin" | "connect";
  state: string;
  verifier: string;
  actor: string | null;
};
export const vkReceiptHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function vkCookie(request: Request, name: string) {
  const values = (request.headers.get("cookie") || "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(name + "="));
  return values.length === 1 ? values[0].slice(name.length + 1) : "";
}
export function vkSecureCookie(
  name: string,
  value: string,
  maxAge = VK_ACCOUNT_SECONDS,
) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
export function startVKAccountFlow(
  config: VKConfig,
  mode: "signin" | "connect",
  actor: string | null = null,
  now = Math.floor(Date.now() / 1000),
) {
  if (mode === "connect" ? !validUuid(actor) : actor !== null)
    throw new Error("Invalid VK flow");
  const verifier = randomBytes(32).toString("base64url"),
    state = "lvk_" + randomBytes(32).toString("base64url");
  const flow = sealVKFlow(
    config,
    "account",
    { mode, actor, state, verifier },
    now,
  );
  const url = new URL("https://id.vk.ru/authorize");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: new URL("/auth/vk/callback", config.site).href,
    response_type: "code",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return { url: url.href, cookie: vkSecureCookie(VK_ACCOUNT_COOKIE, flow) };
}
export function readVKAccountFlow(
  request: Request,
  config: VKConfig,
  now = Math.floor(Date.now() / 1000),
): VKAccountFlow | null {
  const data = openVKFlow(
    config,
    "account",
    vkCookie(request, VK_ACCOUNT_COOKIE),
    now,
  );
  if (
    !data ||
    (data.mode !== "signin" && data.mode !== "connect") ||
    typeof data.state !== "string" ||
    !/^lvk_[A-Za-z0-9_-]{43}$/.test(data.state) ||
    typeof data.verifier !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(data.verifier) ||
    (data.mode === "connect" ? !validUuid(data.actor) : data.actor !== null)
  )
    return null;
  return {
    mode: data.mode,
    actor: data.actor as string | null,
    state: data.state,
    verifier: data.verifier,
  };
}
export async function verifyVKAccountReturn(
  request: Request,
  config: VKConfig,
  actor: string | null,
  fetcher: typeof fetch = fetch,
  now = Math.floor(Date.now() / 1000),
) {
  const flow = readVKAccountFlow(request, config, now),
    p = new URL(request.url).searchParams;
  const one = (key: string) => (p.getAll(key).length === 1 ? p.get(key)! : "");
  const state = one("state"),
    code = one("code"),
    device = one("device_id");
  if (
    !flow ||
    (flow.mode === "connect" && flow.actor !== actor) ||
    p.has("error") ||
    !/^lvk_[A-Za-z0-9_-]{43}$/.test(state) ||
    state.length !== flow.state.length ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(flow.state)) ||
    !/^[A-Za-z0-9._~+\/=-]{8,2048}$/.test(code) ||
    !/^[A-Za-z0-9._~+\/=-]{1,512}$/.test(device)
  )
    return null;
  // Reuse the reviewed server exchange. Tokens never
  // leave this function and are not written to a cookie, database or URL.
  const envelope = sealVKFlow(
    config,
    "exchange",
    {
      state,
      code,
      device,
      challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    },
    now,
  );
  const tokenResponse = await vkToken(
    new Request(new URL("/api/auth/vk/token", config.site), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${config.clientId}:${config.secret}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: envelope,
        code_verifier: flow.verifier,
        redirect_uri: new URL("/auth/v1/callback", config.supabase).href,
      }),
    }),
    config,
    fetcher,
    now,
  );
  if (!tokenResponse.ok) return null;
  const token: unknown = await tokenResponse.json();
  if (!isRecord(token) || typeof token.access_token !== "string") return null;
  try {
    // Linked login proves a stable VK ID, not ownership of a VK email. The
    // existing LEADLY session proves the target account. Original Supabase
    // sign-up retains its own email scope and mail confirmation requirements.
    const response = await fetcher("https://id.vk.ru/oauth2/user_info", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        access_token: token.access_token,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const value = await readLimitedJson(response, 64000);
    if (!isRecord(value) || value.error || !isRecord(value.user)) return null;
    const user = value.user;
    const id =
      typeof user.user_id === "number" && Number.isSafeInteger(user.user_id)
        ? String(user.user_id)
        : user.user_id;
    if (typeof id !== "string" || !/^[1-9]\d{0,19}$/.test(id)) return null;
    const name = [user.first_name, user.last_name]
      .filter((v) => typeof v === "string")
      .join(" ")
      .trim()
      .slice(0, 80);
    return { flow, vkId: id, name: name || "Профиль VK" };
  } catch {
    return null;
  }
}
