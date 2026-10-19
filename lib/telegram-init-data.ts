import { createHmac, timingSafeEqual } from "node:crypto";
import { isRecord } from "./request-guards";

/** Only this server-validated identity may be used for login. Never initDataUnsafe. */
export function verifyTelegramInitData(raw: unknown, botToken: string, now = Date.now()) {
  if (typeof raw !== "string" || !raw || Buffer.byteLength(raw) > 16000 || !botToken)
    throw new Error("Открой LEADLY заново через Telegram.");
  const params = new URLSearchParams(raw);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length || keys.some(key => !/^[a-z_]+$/.test(key)))
    throw new Error("Некорректные данные Telegram.");
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new Error("Подпись Telegram не подтверждена.");
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", key).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex")))
    throw new Error("Подпись Telegram не подтверждена.");
  const date = params.get("auth_date") || "";
  const age = now / 1000 - Number(date);
  if (!/^\d{1,12}$/.test(date) || !Number.isSafeInteger(Number(date)) || age < -30 || age > 300)
    throw new Error("Время входа истекло. Открой LEADLY заново в Telegram.");
  let user: unknown;
  try { user = JSON.parse(params.get("user") || "null"); } catch { throw new Error("Некорректный пользователь Telegram."); }
  if (!isRecord(user) || !Number.isSafeInteger(user.id) || Number(user.id) <= 0 || user.is_bot === true)
    throw new Error("Некорректный пользователь Telegram.");
  return {
    id: Number(user.id),
    username: typeof user.username === "string" && /^[A-Za-z0-9_]{5,32}$/.test(user.username) ? user.username : null,
  };
}
