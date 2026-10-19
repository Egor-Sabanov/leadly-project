import { createBrowserClient } from "@supabase/ssr";
import { authCookieOptions } from "../auth-cookies";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
let browserTelegram = false;

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  if (!url || !key) {
    throw new Error(
      "Подключение аккаунтов ещё не настроено. Обратись к владельцу приложения или попробуй позже.",
    );
  }

  const telegram = /(?:^|;\s*)leadly-tg=1(?:;|$)/.test(document.cookie);
  if (!browserClient || browserTelegram !== telegram) {
    browserClient?.auth.stopAutoRefresh();
    browserTelegram = telegram;
    browserClient = createBrowserClient(url, key, {
      isSingleton: false,
      cookieOptions: authCookieOptions(window.location.origin, false, telegram),
    });
  }
  return browserClient;
}
