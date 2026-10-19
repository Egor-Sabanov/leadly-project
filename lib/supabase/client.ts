import { createBrowserClient } from "@supabase/ssr";
import { authCookieOptions } from "../auth-cookies";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

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

  if (!browserClient)
    browserClient = createBrowserClient(url, key, {
      cookieOptions: authCookieOptions(window.location.origin),
    });
  return browserClient;
}
