import { NextResponse, type NextRequest } from "next/server";
import { loadSocialAuthOptions } from "@/lib/auth-provider-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request-guards";
import { vkConfig } from "@/lib/vk-oauth";
import { startVKAccountFlow, vkPrivateHeaders } from "@/lib/vk-account-oauth";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const origin = requestOrigin(request);
  if (!["google", "github", "vk", "yandex"].includes(provider))
    return NextResponse.redirect(new URL("/auth?error=provider", origin));
  const option = (await loadSocialAuthOptions()).find(
    (o) => o.id === provider && o.enabled,
  );
  if (!option)
    return NextResponse.redirect(new URL("/auth?error=provider", origin));
  try {
    if (
      provider === "vk" &&
      request.nextUrl.searchParams.get("transport") !== "provider"
    ) {
      const config = vkConfig();
      if (!config)
        return NextResponse.redirect(new URL("/auth?error=provider", origin));
      const start = startVKAccountFlow(config, "signin");
      return new NextResponse(null, {
        status: 303,
        headers: {
          ...vkPrivateHeaders,
          Location: start.url,
          "Set-Cookie": start.cookie,
        },
      });
    }
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: option.provider,
      options: {
        redirectTo: new URL("/auth/callback", origin).href,
        skipBrowserRedirect: true,
        ...(provider === "google"
          ? { queryParams: { prompt: "select_account" } }
          : {}),
      },
    });
    const destination = data.url ? new URL(data.url) : null;
    if (
      error ||
      !destination ||
      destination.origin !==
        new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin ||
      destination.pathname !== "/auth/v1/authorize"
    )
      return NextResponse.redirect(new URL("/auth?error=provider", origin));
    return NextResponse.redirect(destination);
  } catch {
    return NextResponse.redirect(new URL("/auth?error=provider", origin));
  }
}
