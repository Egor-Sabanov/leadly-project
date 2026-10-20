import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Buffer } from "node:buffer";
import { isRecord, readLimitedJson } from "./request-guards";

export const VK_FLOW_COOKIE = "__Host-leadly-vk-flow";
const FLOW_SECONDS = 300;
const HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};
export type VKConfig = {
  clientId: string;
  secret: string;
  site: string;
  supabase: string;
};
export function vkConfig(): VKConfig | null {
  const {
    LEADLY_VK_CLIENT_ID: clientId,
    LEADLY_VK_BRIDGE_SECRET: secret,
    LEADLY_SITE_URL: site,
    NEXT_PUBLIC_SUPABASE_URL: supabase,
  } = process.env;
  if (
    !clientId ||
    !/^[1-9]\d{4,14}$/.test(clientId) ||
    !secret ||
    !/^[a-f0-9]{64}$/.test(secret) ||
    !site ||
    !supabase
  )
    return null;
  try {
    const s = new URL(site),
      a = new URL(supabase);
    if (
      s.protocol !== "https:" ||
      a.protocol !== "https:" ||
      s.username ||
      s.password ||
      a.username ||
      a.password
    )
      return null;
    return { clientId, secret, site: s.origin, supabase: a.origin };
  } catch {
    return null;
  }
}
const reply = (body: object, status = 200) =>
  Response.json(body, { status, headers: HEADERS });
function redirect(url: URL, cookie?: string) {
  const headers = new Headers({ ...HEADERS, Location: url.href });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}
function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const challenge = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
function seal(config: VKConfig, kind: string, data: object, now: number) {
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(config.secret, "hex"),
      iv,
    );
  cipher.setAAD(Buffer.from(`leadly:vk:${config.clientId}:${kind}:1`));
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify({ ...data, exp: now + FLOW_SECONDS })),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url");
}
function open(
  config: VKConfig,
  kind: string,
  value: string,
  now: number,
): Record<string, unknown> | null {
  if (!/^[A-Za-z0-9_-]{40,10000}$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, "base64url"),
      decipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(config.secret, "hex"),
        bytes.subarray(0, 12),
      );
    decipher.setAuthTag(bytes.subarray(12, 28));
    decipher.setAAD(Buffer.from(`leadly:vk:${config.clientId}:${kind}:1`));
    const data: unknown = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
    if (
      !isRecord(data) ||
      typeof data.exp !== "number" ||
      data.exp <= now ||
      data.exp > now + FLOW_SECONDS
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
const unix = () => Math.floor(Date.now() / 1000);
// Server-only capsules share encryption, but their AAD separates login, linking
// and provider exchange. A capsule of one kind cannot be used as another.
export { seal as sealVKFlow, open as openVKFlow };
const callback = (c: VKConfig) => new URL("/auth/vk/callback", c.site).href;
const authCallback = (c: VKConfig) =>
  new URL("/auth/v1/callback", c.supabase).href;
const clearCookie = `${VK_FLOW_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
function unique(params: URLSearchParams, key: string) {
  return params.getAll(key).length === 1 ? params.get(key)! : "";
}

/** Adapt the provider redirect only. Supabase owns both OAuth state and the PKCE verifier. */
export function vkAuthorize(
  request: Request,
  config: VKConfig | null = vkConfig(),
  now = unix(),
): Response {
  if (!config) return reply({ error: "provider_unavailable" }, 503);
  const p = new URL(request.url).searchParams;
  const state = unique(p, "state"),
    codeChallenge = unique(p, "code_challenge");
  if (
    unique(p, "client_id") !== config.clientId ||
    unique(p, "redirect_uri") !== authCallback(config) ||
    unique(p, "response_type") !== "code" ||
    unique(p, "code_challenge_method") !== "S256" ||
    !/^[A-Za-z0-9._~-]{16,1800}$/.test(state) ||
    !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
  )
    return reply({ error: "invalid_request" }, 400);
  const flow = seal(
    config,
    "browser",
    { state, challenge: codeChallenge },
    now,
  );
  if (flow.length > 3500) return reply({ error: "invalid_request" }, 400);
  const destination = new URL("https://id.vk.ru/authorize");
  destination.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callback(config),
    response_type: "code",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return redirect(
    destination,
    `${VK_FLOW_COOKIE}=${flow}; Path=/; Max-Age=${FLOW_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  );
}

/** Bind device_id to this browser, state, PKCE challenge and a short-lived encrypted code. */
export function vkCallback(
  request: Request,
  config: VKConfig | null = vkConfig(),
  now = unix(),
): Response {
  if (!config) return reply({ error: "provider_unavailable" }, 503);
  const fail = () =>
    redirect(new URL("/auth?error=oauth", config.site), clearCookie);
  const p = new URL(request.url).searchParams;
  const cookies = (request.headers.get("cookie") || "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${VK_FLOW_COOKIE}=`));
  const flow =
    cookies.length === 1
      ? open(
          config,
          "browser",
          cookies[0].slice(VK_FLOW_COOKIE.length + 1),
          now,
        )
      : null;
  const state = unique(p, "state"),
    code = unique(p, "code"),
    device = unique(p, "device_id");
  if (
    !flow ||
    typeof flow.state !== "string" ||
    typeof flow.challenge !== "string" ||
    !equal(flow.state, state) ||
    p.has("error") ||
    !/^[A-Za-z0-9._~+\/-]{8,2048}$/.test(code) ||
    !/^[A-Za-z0-9._~+-]{1,512}$/.test(device)
  )
    return fail();
  const destination = new URL(authCallback(config));
  destination.search = new URLSearchParams({
    state,
    code: seal(
      config,
      "exchange",
      { state, challenge: flow.challenge, code, device },
      now,
    ),
  }).toString();
  return redirect(destination, clearCookie);
}

async function readForm(request: Request): Promise<URLSearchParams> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/x-www-form-urlencoded"
  )
    throw Error();
  if (Number(request.headers.get("content-length")) > 16000) throw Error();
  const reader = request.body?.getReader();
  if (!reader) throw Error();
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16000) {
        await reader.cancel();
        throw Error();
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new URLSearchParams(Buffer.concat(parts).toString());
}

/** Server-to-server exchange. The bridge secret is separate from VK's protected/service keys. */
export async function vkToken(
  request: Request,
  config: VKConfig | null = vkConfig(),
  fetcher: typeof fetch = fetch,
  now = unix(),
): Promise<Response> {
  if (!config) return reply({ error: "provider_unavailable" }, 503);
  let p: URLSearchParams;
  try {
    p = await readForm(request);
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }
  const authorization = request.headers.get("authorization") || "";
  let clientId = unique(p, "client_id"),
    secret = unique(p, "client_secret");
  if (authorization) {
    if (
      !/^Basic [A-Za-z0-9+/=]{1,512}$/.test(authorization) ||
      p.has("client_secret")
    )
      return reply({ error: "invalid_client" }, 401);
    try {
      const credentials = Buffer.from(
        authorization.slice(6),
        "base64",
      ).toString();
      const separator = credentials.indexOf(":");
      clientId = decodeURIComponent(credentials.slice(0, separator));
      secret = decodeURIComponent(credentials.slice(separator + 1));
      if (
        separator < 1 ||
        (p.has("client_id") && unique(p, "client_id") !== clientId)
      )
        return reply({ error: "invalid_client" }, 401);
    } catch {
      return reply({ error: "invalid_client" }, 401);
    }
  }
  if (clientId !== config.clientId || !equal(secret, config.secret))
    return reply({ error: "invalid_client" }, 401);
  const verifier = unique(p, "code_verifier");
  const data = open(config, "exchange", unique(p, "code"), now);
  if (
    unique(p, "grant_type") !== "authorization_code" ||
    unique(p, "redirect_uri") !== authCallback(config) ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
    !data ||
    typeof data.challenge !== "string" ||
    !equal(challenge(verifier), data.challenge) ||
    typeof data.code !== "string" ||
    typeof data.device !== "string" ||
    typeof data.state !== "string"
  )
    return reply({ error: "invalid_grant" }, 400);
  try {
    const response = await fetcher("https://id.vk.ru/oauth2/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        redirect_uri: callback(config),
        code: data.code,
        device_id: data.device,
        code_verifier: verifier,
        state: data.state,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      return reply(
        {
          error:
            response.status < 500 && response.status !== 429
              ? "invalid_grant"
              : "provider_unavailable",
        },
        response.status < 500 && response.status !== 429 ? 400 : 503,
      );
    const result = await readLimitedJson(response, 64000);
    if (
      !isRecord(result) ||
      result.error ||
      typeof result.access_token !== "string" ||
      !/^[A-Za-z0-9._~+\/-]{16,8192}$/.test(result.access_token) ||
      typeof result.state !== "string" ||
      !equal(result.state, data.state) ||
      typeof result.expires_in !== "number" ||
      !Number.isFinite(result.expires_in) ||
      result.expires_in <= 0 ||
      result.expires_in > 31536000
    )
      return reply({ error: "invalid_grant" }, 400);
    // Refresh and ID tokens are unnecessary for this exchange and are never persisted by LEADLY.
    return reply({
      access_token: result.access_token,
      token_type: "Bearer",
      expires_in: result.expires_in,
    });
  } catch {
    return reply({ error: "provider_unavailable" }, 503);
  }
}

export function vkClaims(value: unknown) {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  const user = value.user,
    id =
      typeof user.user_id === "number" && Number.isSafeInteger(user.user_id)
        ? String(user.user_id)
        : user.user_id;
  if (
    typeof id !== "string" ||
    !/^[1-9]\d{0,19}$/.test(id)
  )
    return null;
  const name = [user.first_name, user.last_name]
    .filter((v) => typeof v === "string")
    .join(" ")
    .trim()
    .slice(0, 80);
  return {
    sub: id,
    // VK proves its subject. Do not send an unverified email to automatic
    // account linking. Supabase custom:vk must allow users without email.
    ...(name ? { name } : {}),
  };
}

export async function vkUserinfo(
  request: Request,
  config: VKConfig | null = vkConfig(),
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (!config) return reply({ error: "provider_unavailable" }, 503);
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer [A-Za-z0-9._~+\/-]{16,8192}$/.test(authorization))
    return reply({ error: "invalid_token" }, 401);
  try {
    const response = await fetcher("https://id.vk.ru/oauth2/user_info", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        access_token: authorization.slice(7),
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      return reply(
        {
          error:
            response.status === 401 || response.status === 403
              ? "invalid_token"
              : "provider_unavailable",
        },
        response.status === 401 || response.status === 403 ? 401 : 503,
      );
    const result = await readLimitedJson(response, 64000);
    if (isRecord(result) && result.error)
      return reply({ error: "invalid_token" }, 401);
    const claims = vkClaims(result);
    return claims
      ? reply(claims)
      : reply({ error: "profile_unavailable" }, 422);
  } catch {
    return reply({ error: "provider_unavailable" }, 503);
  }
}
