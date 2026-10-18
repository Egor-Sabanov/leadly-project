import type { Provider } from "@supabase/supabase-js";
export type SocialAuthOption = {
  id: "google" | "github" | "vk" | "yandex";
  label: string;
  provider: Provider;
  enabled: boolean;
};
export function socialAuthCatalog(
  vk = "custom:vk",
  yandex = "custom:yandex",
): SocialAuthOption[] {
  const custom = (value: string, fallback: string): Provider =>
    (/^custom:[a-z0-9_-]{1,60}$/.test(value) ? value : fallback) as Provider;
  return [
    { id: "google", label: "Google", provider: "google", enabled: false },
    { id: "github", label: "GitHub", provider: "github", enabled: false },
    {
      id: "vk",
      label: "VK ID",
      provider: custom(vk, "custom:vk"),
      enabled: false,
    },
    {
      id: "yandex",
      label: "Яндекс ID",
      provider: custom(yandex, "custom:yandex"),
      enabled: false,
    },
  ];
}
export function enabledNativeProviders(
  options: SocialAuthOption[],
  settings: unknown,
) {
  const external =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as { external?: unknown }).external
      : null;
  if (!external || typeof external !== "object" || Array.isArray(external))
    return options;
  return options.map((option) => ({
    ...option,
    enabled:
      !option.provider.startsWith("custom:") &&
      (external as Record<string, unknown>)[option.provider] === true,
  }));
}
