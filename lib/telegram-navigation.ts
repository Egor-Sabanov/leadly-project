export type TelegramDestination = "/" | "/opportunities" | "/tasks" | "/profile" | "/crm" | "/opportunities?saved=1&scope=all" | "/profile#telegram";
export function telegramDestination(value: unknown): TelegramDestination {
  return typeof value === "string" && ["/", "/opportunities", "/tasks", "/profile", "/crm", "/opportunities?saved=1&scope=all", "/profile#telegram"].includes(value) ? value as TelegramDestination : "/";
}
export function telegramInset(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(200, value)) : 0;
}
