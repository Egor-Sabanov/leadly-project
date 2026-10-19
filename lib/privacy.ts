/** Change this version whenever the notice or processing purposes change. */
export const PRIVACY_NOTICE_VERSION = "2026-10-19.2";

/** Notice acknowledgement is separate from cookies and marketing permissions. */
export function needsSocialPrivacyNotice(user: {
  app_metadata?: { provider?: unknown; providers?: unknown };
  user_metadata?: Record<string, unknown>;
}) {
  const providers = user.app_metadata?.providers;
  const social =
    (typeof user.app_metadata?.provider === "string" &&
      user.app_metadata.provider !== "email") ||
    (Array.isArray(providers) &&
      providers.some((p) => typeof p === "string" && p !== "email"));
  return (
    !!social &&
    (user.user_metadata?.privacy_notice_version !== PRIVACY_NOTICE_VERSION ||
      typeof user.user_metadata?.privacy_notice_acknowledged_at !== "string" ||
      !Number.isFinite(
        Date.parse(user.user_metadata.privacy_notice_acknowledged_at),
      ))
  );
}
