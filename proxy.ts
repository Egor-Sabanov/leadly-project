import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
/** Refresh cookie sessions in the response, where cookie writes are supported. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const pathname = request.nextUrl.pathname;
  const privatePaths = [
    "/welcome",
    "/onboarding",
    "/profile",
    "/opportunities",
    "/crm",
    "/tasks",
    "/clients",
    "/analytics",
    "/revenue",
    "/settings",
    "/sources",
    "/ai-outreach",
    "/supabase-test",
  ];
  const privatePage =
    pathname === "/" ||
    privatePaths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  let authenticated = false;
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    authenticated = !error && !!user;
  } catch {
    /* Public entry and privacy pages remain reachable on provider failure. */
  }
  if (privatePage && !authenticated) {
    const login = NextResponse.redirect(new URL("/auth", request.url));
    for (const cookie of response.cookies.getAll()) login.cookies.set(cookie);
    return login;
  }
  return response;
}
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
