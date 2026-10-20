import { requestOrigin } from "@/lib/request-guards";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { oauthFailurePath } from "@/lib/oauth-callback";
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.has("error"))
    return NextResponse.redirect(
      new URL(
        oauthFailurePath(
          request.nextUrl.searchParams.get("error_code"),
          request.nextUrl.searchParams.get("error_description"),
        ),
        requestOrigin(request),
      ),
    );
  const code = request.nextUrl.searchParams.get("code");
  const target =
    request.nextUrl.searchParams.get("next") === "/auth/reset"
      ? "/auth/reset"
      : "/welcome";
  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error)
        return NextResponse.redirect(new URL(target, requestOrigin(request)));
    } catch {}
  }
  return NextResponse.redirect(
    new URL("/auth?error=callback", requestOrigin(request)),
  );
}
