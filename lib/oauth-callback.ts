export const PROVIDER_EMAIL_NOTICE =
  "Подтверди почту, чтобы завершить вход через сервис. Проверь входящие и спам. После подтверждения вернись и снова нажми кнопку своего сервиса. Если письма нет, запроси его повторно ниже.";
export const PROVIDER_LINK_NOTICE =
  "Сервис не передал подтверждённую почту. Письмо подтверждения не отправлено. Если у тебя уже есть аккаунт LEADLY, войди прежним способом; для нового аккаунта выбери другой сервис или регистрацию по почте.";

/** Only known reasons cross the redirect; provider text and credentials never do. */
export function oauthFailurePath(
  errorCode: unknown,
  description?: unknown,
): string {
  // Supabase uses the same error code both when it sends mail and when it has no
  // usable primary email (for example, an unverified address already in use).
  // Classify only its known no-mail wording; never reflect provider text or PII.
  if (
    errorCode === "provider_email_needs_verification" &&
    typeof description === "string" &&
    /^Unverified email with ([a-z0-9:_-]{1,80})\. Verify the email with \1 in order to sign in$/.test(
      description,
    )
  )
    return "/auth?error=provider_link&mode=signin";
  return errorCode === "provider_email_needs_verification" ||
    errorCode === "email_not_confirmed"
    ? "/auth?error=email_verification&mode=confirm"
    : "/auth?error=oauth";
}
