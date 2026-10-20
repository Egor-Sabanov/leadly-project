export const PROVIDER_EMAIL_NOTICE =
  "Подтверди почту, чтобы завершить вход через сервис. Проверь входящие и спам. После подтверждения вернись и снова нажми кнопку своего сервиса. Если письма нет, запроси его повторно ниже.";

/** Only known reasons cross the redirect; provider text and credentials never do. */
export function oauthFailurePath(errorCode: unknown): string {
  return errorCode === "provider_email_needs_verification" || errorCode === "email_not_confirmed"
    ? "/auth?error=email_verification&mode=confirm"
    : "/auth?error=oauth";
}
