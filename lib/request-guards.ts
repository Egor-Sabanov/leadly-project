/** Read untrusted JSON with a hard byte limit, including chunked requests. */
export async function readLimitedJson(
  request: Pick<Request, "headers" | "body">,
  maxBytes = 16000,
): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new RangeError("Тело запроса слишком большое");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Пустой запрос");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RangeError("Тело запроса слишком большое");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(body));
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
/** In production configure LEADLY_SITE_URL; local Next may normalize request.url to localhost. */
export function requestOrigin(request: Request) {
  if (process.env.LEADLY_SITE_URL)
    return new URL(process.env.LEADLY_SITE_URL).origin;
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host && /^[a-zA-Z0-9.\[\]:-]+$/.test(host)) url.host = host;
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded === "https") url.protocol = "https:";
  return url.origin;
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === requestOrigin(request);
}
