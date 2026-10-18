import { requestOrigin } from "@/lib/request-guards";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const target =
    request.nextUrl.searchParams.get("next") === "/auth/reset"
      ? "/auth/reset"
      : "/onboarding";
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
