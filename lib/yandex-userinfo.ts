import { isRecord, readLimitedJson } from "./request-guards";

export type YandexClaims = { sub: string; email: string; email_verified: false; name?: string };
/** Yandex email ownership is not inferred from the presence of default_email. */
export function yandexClaims(value: unknown): YandexClaims | null {
  if (!isRecord(value) || typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id)) return null;
  if (typeof value.default_email !== "string" || value.default_email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.default_email)) return null;
  const display = [value.real_name, value.display_name].find(name => typeof name === "string" && name.trim());
  return {
    sub: value.id,
    email: value.default_email,
    email_verified: false,
    ...(typeof display === "string" ? { name: display.trim().slice(0, 80) } : {}),
  };
}

/** This endpoint translates userinfo only; it never creates a LEADLY session. */
export async function yandexUserinfo(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  const reply = (body: object, status = 200) => Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" },
  });
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer [A-Za-z0-9._~-]{16,4096}$/.test(authorization)) return reply({ error: "invalid_token" }, 401);
  try {
    // Fixed destination; token is sent only in a header, never a query or log.
    const response = await fetcher("https://login.yandex.ru/info?format=json", {
      headers: { Authorization: `OAuth ${authorization.slice(7)}`, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401 || response.status === 403) return reply({ error: "invalid_token" }, 401);
    if (!response.ok) return reply({ error: "provider_unavailable" }, 503);
    const claims = yandexClaims(await readLimitedJson(response, 64000));
    if (!claims) return reply({ error: "profile_email_required" }, 422);
    return reply(claims);
  } catch {
    return reply({ error: "provider_unavailable" }, 503);
  }
}
