type TelegramDestination = "/" | "/opportunities" | "/tasks" | "/profile";
export function telegramDestination(value: unknown): TelegramDestination {
  return typeof value === "string" && ["/", "/opportunities", "/tasks", "/profile"].includes(value) ? value as TelegramDestination : "/";
}
export function telegramInset(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(200, value)) : 0;
}
