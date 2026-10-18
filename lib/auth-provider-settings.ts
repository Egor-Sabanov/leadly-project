import { createClient } from "@supabase/supabase-js";
import { socialAuthCatalog, enabledNativeProviders } from "./auth-providers";
/** Return availability only. Provider credentials and admin responses never reach the browser. */
export async function loadSocialAuthOptions() {
  let options = socialAuthCatalog(
    process.env.LEADLY_VK_AUTH_PROVIDER,
    process.env.LEADLY_YANDEX_AUTH_PROVIDER,
  );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return options;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok)
      options = enabledNativeProviders(options, await response.json());
  } catch {
    /* Fail closed: an unreachable provider is never advertised as working. */
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(5000) }),
      },
    });
    options = await Promise.all(
      options.map(async (option) => {
        if (!option.provider.startsWith("custom:")) return option;
        try {
          const { data, error } =
            await admin.auth.admin.customProviders.getProvider(option.provider);
          return {
            ...option,
            enabled:
              !error &&
              data?.identifier === option.provider &&
              data.enabled === true,
          };
        } catch {
          return option;
        }
      }),
    );
  }
  return options;
}
