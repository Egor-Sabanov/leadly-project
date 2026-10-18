import { isRecord } from "./request-guards";
export type TelegramChannelRule = {
  chatId: string;
  type: "project" | "job" | "client";
  name?: string;
};
/** Explicit per-channel types prevent vacancy channels becoming freelance customer orders. */
export function parseTelegramChannelRules(
  json?: string,
  legacyIds?: string,
  legacyType?: string,
): TelegramChannelRule[] {
  const allowedTypes = ["project", "job", "client"];
  if (!json?.trim()) {
    if (!legacyIds?.trim() || !allowedTypes.includes(legacyType || ""))
      return [];
    return [
      ...new Set(
        legacyIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ]
      .slice(0, 50)
      .map((chatId) => ({
        chatId,
        type: legacyType as TelegramChannelRule["type"],
      }));
  }
  const rows: unknown = JSON.parse(json);
  if (!Array.isArray(rows) || rows.length > 50)
    throw new Error("Укажи до 50 разрешённых Telegram-каналов.");
  const seen = new Set<string>();
  return rows.map((row) => {
    if (
      !isRecord(row) ||
      typeof row.chatId !== "string" ||
      !/^-100\d{4,20}$/.test(row.chatId) ||
      typeof row.type !== "string" ||
      !allowedTypes.includes(row.type) ||
      seen.has(row.chatId) ||
      (row.name !== undefined &&
        (typeof row.name !== "string" || row.name.length > 100))
    )
      throw new Error("Проверь ID, тип и повторы Telegram-каналов.");
    seen.add(row.chatId);
    return {
      chatId: row.chatId,
      type: row.type as TelegramChannelRule["type"],
      ...(typeof row.name === "string" ? { name: row.name } : {}),
    };
  });
}
