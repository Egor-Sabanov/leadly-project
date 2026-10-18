import { isRecord, readLimitedJson } from "./request-guards";
import type { TelegramChannelRule } from "./telegram-channel-rules";
export async function setupTelegramWebhook(
  config: {
    token: string;
    secret: string;
    siteUrl: string;
    rules: TelegramChannelRule[];
    apply: boolean;
  },
  fetcher: typeof fetch = fetch,
) {
  if (!/^\d+:[A-Za-z0-9_-]{20,100}$/.test(config.token))
    throw new Error("Добавь TELEGRAM_BOT_TOKEN в защищённые настройки.");
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(config.secret))
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET: 32–256 символов A–Z, a–z, 0–9, _ или -.",
    );
  let origin: URL;
  try {
    origin = new URL(config.siteUrl);
  } catch {
    throw new Error("Укажи публичный HTTPS LEADLY_SITE_URL.");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    origin.hostname === "localhost" ||
    origin.hostname.endsWith(".localhost") ||
    /^(?:127\.|10\.|192\.168\.|0\.)/.test(origin.hostname)
  )
    throw new Error(
      "Для Telegram нужен публичный HTTPS origin без пути или параметров.",
    );
  if (!config.rules.length)
    throw new Error("Сначала укажи разрешённые каналы.");
  async function call(method: string, payload: Record<string, unknown> = {}) {
    let response: Response;
    try {
      response = await fetcher(
        `https://api.telegram.org/bot${config.token}/${method}`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(12000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
    } catch {
      throw new Error(
        "Не удалось связаться с Telegram Bot API. Проверь сеть и конфигурацию.",
      );
    }
    if (!response.ok)
      throw new Error(`Telegram ${method}: HTTP ${response.status}.`);
    const body = await readLimitedJson(response, 512000);
    if (!isRecord(body) || body.ok !== true)
      throw new Error(`Telegram ${method} отклонил запрос.`);
    return body.result;
  }
  const bot = await call("getMe");
  if (!isRecord(bot) || !Number.isSafeInteger(bot.id) || bot.is_bot !== true)
    throw new Error("Telegram не подтвердил бота.");
  for (const rule of config.rules) {
    const chat = await call("getChat", { chat_id: rule.chatId });
    if (
      !isRecord(chat) ||
      String(chat.id) !== rule.chatId ||
      chat.type !== "channel" ||
      typeof chat.username !== "string" ||
      !/^\w{5,32}$/.test(chat.username)
    )
      throw new Error("Разрешены только доступные боту публичные каналы.");
    const member = await call("getChatMember", {
      chat_id: rule.chatId,
      user_id: bot.id,
    });
    if (
      !isRecord(member) ||
      !["administrator", "creator"].includes(String(member.status))
    )
      throw new Error(
        "Владелец канала должен предоставить боту доступ администратора.",
      );
  }
  const webhook = new URL("/api/telegram/webhook", origin).href;
  if (config.apply) {
    const result = await call("setWebhook", {
      url: webhook,
      secret_token: config.secret,
      allowed_updates: ["channel_post"],
      drop_pending_updates: false,
    });
    if (result !== true) throw new Error("Webhook не подтверждён Telegram.");
  }
  const info = await call("getWebhookInfo");
  if (!isRecord(info)) throw new Error("Не удалось проверить webhook.");
  return {
    applied: config.apply,
    configuredUrlMatches: info.url === webhook,
    authorizedChannels: config.rules.length,
    pendingUpdates:
      typeof info.pending_update_count === "number"
        ? info.pending_update_count
        : null,
    deliveryErrorPresent: typeof info.last_error_message === "string",
  };
}
