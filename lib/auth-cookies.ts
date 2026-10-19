/** Browser-readable session cookies are required by Supabase SSR; HTTPS stays Secure. */
export function authCookieOptions(origin = "", hosted = false, telegram = false) {
  const secure = hosted || origin.startsWith("https://");
  if (telegram && secure) return { path: "/", sameSite: "none" as const, secure: true, partitioned: true };
  return {
    path: "/",
    sameSite: "lax" as const,
    secure,
  };
}
