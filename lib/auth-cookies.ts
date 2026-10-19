/** Browser-readable session cookies are required by Supabase SSR; HTTPS stays Secure. */
export function authCookieOptions(origin = "", hosted = false) {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: hosted || origin.startsWith("https://"),
  };
}
