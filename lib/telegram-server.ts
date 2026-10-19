import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const telegramHeaders = { "Cache-Control": "private, no-store, max-age=0" };
export function telegramJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: telegramHeaders });
}
export function telegramConfigured() {
  return !!process.env.TELEGRAM_BOT_TOKEN &&
    /^[A-Za-z0-9_]{5,32}$/.test(process.env.TELEGRAM_BOT_USERNAME || "") &&
    !!process.env.TELEGRAM_WEBHOOK_SECRET;
}
export function telegramAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Подключение Telegram пока недоступно.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }) },
  });
}
