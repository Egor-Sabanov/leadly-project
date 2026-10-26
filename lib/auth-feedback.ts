export type AuthAction = "signin" | "signup" | "recovery" | "confirm" | "password";

export const AUTH_MAIL_WAIT_SECONDS = 60;
export const AUTH_MAIL_STORAGE_KEY = "leadly:auth:mail-until:v1";
export const CONFIRMATION_MESSAGE =
  "Если для этого адреса ожидается подтверждение, письмо отправлено. Проверь входящие и спам. Если ты уже подтверждал почту или входил через Google, войди прежним способом.";
export const RECOVERY_MESSAGE =
  "Если аккаунт с таким адресом существует, письмо со ссылкой восстановления отправлено. Проверь входящие и спам.";

export function authErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
}

/** Never render provider internals, email addresses, request URLs or tokens. */
export function authErrorMessage(error: unknown, action: AuthAction): string {
  const code = authErrorCode(error);
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  if (status === 429 || ["over_email_send_rate_limit", "over_request_rate_limit"].includes(code))
    return "Слишком много попыток. Подожди немного и попробуй снова.";
  if (status === 504 || code === "request_timeout")
    return "Сервис входа не ответил вовремя. Попробуй ещё раз чуть позже.";
  if (typeof status === "number" && status >= 500 && status < 600)
    return "Сервис входа временно недоступен. Попробуй ещё раз чуть позже.";
  if (code === "leadly_auth_unavailable")
    return "Подключение аккаунтов ещё не настроено. Попробуй позже.";
  if (code === "email_not_confirmed")
    return "Сначала подтверди почту. Если письмо не пришло, запроси его повторно ниже.";
  if (["invalid_credentials", "user_not_found", "user_banned"].includes(code) && action === "signin")
    return "Не удалось войти. Проверь почту и пароль или используй прежний способ входа.";
  if (["user_already_exists", "email_exists", "user_not_found"].includes(code) && ["signup", "confirm"].includes(action))
    return CONFIRMATION_MESSAGE;
  if (["email_address_invalid", "validation_failed"].includes(code))
    return "Проверь введённые данные и адрес почты.";
  if (code === "weak_password")
    return "Выбери более надёжный пароль: не меньше 8 символов, с буквами и цифрами.";
  if (code === "same_password")
    return "Новый пароль должен отличаться от прежнего.";
  if (["otp_expired", "otp_disabled", "bad_code_verifier", "flow_state_not_found", "flow_state_expired", "session_not_found", "refresh_token_not_found", "refresh_token_already_used"].includes(code))
    return "Ссылка или сессия больше не действует. Запроси новое письмо либо войди снова.";
  if (code === "reauthentication_needed" || code === "reauthentication_not_valid")
    return "Для смены пароля запроси новую ссылку восстановления и открой её в этом браузере.";
  if (error instanceof TypeError || (error && typeof error === "object" && "name" in error && error.name === "AuthRetryableFetchError"))
    return "Не удалось связаться с сервисом. Проверь подключение и попробуй ещё раз.";
  return action === "password"
    ? "Не удалось изменить пароль. Попробуй ещё раз или запроси новую ссылку."
    : "Не удалось выполнить запрос. Попробуй ещё раз чуть позже.";
}

export function mailWaitSeconds(until: unknown, now = Date.now()): number {
  const value = typeof until === "number" ? until : Number(until);
  return Number.isFinite(value)
    ? Math.min(AUTH_MAIL_WAIT_SECONDS, Math.max(0, Math.ceil((value - now) / 1000)))
    : 0;
}

export type EmailConfirmation = { tokenHash: string; type: "signup" | "email" | "recovery" };
export function emailConfirmation(tokenHash: unknown, type: unknown): EmailConfirmation | null {
  if (typeof tokenHash !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(tokenHash)) return null;
  if (type !== "signup" && type !== "email" && type !== "recovery") return null;
  return { tokenHash, type };
}
