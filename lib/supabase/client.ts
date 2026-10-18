import { createBrowserClient } from '@supabase/ssr';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();

  if (!url || !key) {
    throw new Error(
      'Supabase не настроен. Создай .env.local и укажи NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (или NEXT_PUBLIC_SUPABASE_ANON_KEY). Затем перезапусти npm run dev.'
    );
  }

  if (!browserClient) browserClient = createBrowserClient(url, key);
  return browserClient;
}
