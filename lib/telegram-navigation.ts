export type TelegramDestination = "/" | "/opportunities" | "/tasks" | "/profile" | "/crm" | "/opportunities?saved=1&scope=all" | "/profile#telegram" | `/opportunities/${string}`;
export function telegramDestination(value: unknown): TelegramDestination {
  return typeof value === "string" && (["/", "/opportunities", "/tasks", "/profile", "/crm", "/opportunities?saved=1&scope=all", "/profile#telegram"].includes(value) || /^\/opportunities\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) ? value as TelegramDestination : "/";
}
export function telegramInset(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(200, value)) : 0;
}
