const path = require("node:path");
require("@next/env").loadEnvConfig(path.resolve(__dirname, ".."));
const load = require("./ts-loader.cjs").createTsLoader();
const { parseTelegramChannelRules } = load(
  path.resolve(__dirname, "../lib/telegram-channel-rules.ts"),
);
const { setupTelegramWebhook } = load(
  path.resolve(__dirname, "../lib/telegram-webhook-setup.ts"),
);
(async () => {
  const allowed = new Set(["--check", "--apply"]);
  if (process.argv.slice(2).some((arg) => !allowed.has(arg)))
    throw new Error(
      "Используй --check или --apply. Проверка без --apply не изменяет webhook.",
    );
  const result = await setupTelegramWebhook({
    token: process.env.TELEGRAM_BOT_TOKEN || "",
    secret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
    siteUrl: process.env.LEADLY_SITE_URL || "",
    apply: process.argv.includes("--apply"),
    rules: parseTelegramChannelRules(
      process.env.TELEGRAM_CHANNEL_RULES,
      process.env.TELEGRAM_ALLOWED_CHAT_IDS,
      process.env.TELEGRAM_OPPORTUNITY_TYPE,
    ),
  });
  console.log(JSON.stringify(result, null, 2));
  console.log(
    "Статус webhook не заменяет сквозную проверку новой публикацией из разрешённого канала.",
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
