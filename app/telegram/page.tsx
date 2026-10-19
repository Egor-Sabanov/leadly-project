import { TelegramLaunch } from "@/components/telegram/TelegramLaunch";
export const dynamic = "force-dynamic";
export default function TelegramPage() {
  const name = process.env.TELEGRAM_BOT_USERNAME;
  return <TelegramLaunch botUsername={name && /^[A-Za-z0-9_]{5,32}$/.test(name) ? name : null} />;
}
