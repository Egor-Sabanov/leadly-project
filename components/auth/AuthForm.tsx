"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SocialAuth } from "./SocialAuth";
import { socialAuthCatalog, type SocialAuthOption } from "@/lib/auth-providers";
import { LeadlyLogo } from "@/components/brand/LeadlyLogo";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";
import { AuthStory } from "@/components/brand/AuthStory";
import { AUTH_MAIL_STORAGE_KEY, AUTH_MAIL_WAIT_SECONDS, CONFIRMATION_MESSAGE, RECOVERY_MESSAGE, authErrorCode, authErrorMessage, mailWaitSeconds } from "@/lib/auth-feedback";

type Mode = "signin" | "signup" | "recovery" | "confirm";

export function AuthForm({
  callbackFailed = false,
  socialOptions = socialAuthCatalog(),
  socialError,
  initialMode = "signup",
  initialMessage,
}: {
  callbackFailed?: boolean;
  socialOptions?: SocialAuthOption[];
  socialError?: string;
  initialMode?: Mode;
  initialMessage?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestPending = useRef(false);
  const [mailUntil, setMailUntil] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [message, setMessage] = useState(initialMessage || "");
  const [error, setError] = useState(
    socialError ||
      (callbackFailed
        ? "Не удалось завершить вход: ссылка устарела или проверка сессии не прошла. Повтори вход либо запроси новое письмо."
        : ""),
  );

  useEffect(() => {
    function restore() {
      try {
        const stored = Number(localStorage.getItem(AUTH_MAIL_STORAGE_KEY));
        if (mailWaitSeconds(stored)) {
          setMailUntil(Math.min(stored, Date.now() + AUTH_MAIL_WAIT_SECONDS * 1000));
          setWaitSeconds(mailWaitSeconds(stored));
        }
      } catch { /* Server limits also apply when browser storage is unavailable. */ }
    }
    const timer = setTimeout(restore, 0);
    window.addEventListener("storage", restore);
    return () => { clearTimeout(timer); window.removeEventListener("storage", restore); };
  }, []);
  useEffect(() => {
    if (!mailUntil) return;
    const timer = setInterval(() => {
      const remaining = mailWaitSeconds(mailUntil);
      setWaitSeconds(remaining);
      if (!remaining) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [mailUntil]);

  function startMailWait() {
    const until = Date.now() + AUTH_MAIL_WAIT_SECONDS * 1000;
    setMailUntil(until);
    setWaitSeconds(AUTH_MAIL_WAIT_SECONDS);
    try { localStorage.setItem(AUTH_MAIL_STORAGE_KEY, String(until)); } catch {}
  }
  function changeMode(next: Mode) {
    if (requestPending.current) return;
    setMode(next); setError(""); setMessage(""); setPassword(""); setShowPassword(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current || (mode !== "signin" && waitSeconds > 0)) return;
    if (mode === "signup" && !privacyAccepted) {
      setError("Ознакомься с условиями обработки данных перед регистрацией.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Укажи, как к тебе обращаться.");
      return;
    }
    requestPending.current = true;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (mode === "confirm") {
        startMailWait();
        const { error: resendError } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (resendError) throw resendError;
        setMessage(CONFIRMATION_MESSAGE);
        return;
      }
      if (mode === "recovery") {
        startMailWait();
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
          },
        );
        if (resetError) throw resetError;
        setMessage(RECOVERY_MESSAGE);
        return;
      }
      if (mode === "signup") {
        startMailWait();
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: name.trim(),
              privacy_notice_version: PRIVACY_NOTICE_VERSION,
              privacy_notice_acknowledged_at: new Date().toISOString(),
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (authError) throw authError;
        if (!data.session) {
          setMessage(CONFIRMATION_MESSAGE);
          setPassword("");
          setMode("confirm");
          return;
        }
        // A new identity needs a fresh router cache; public-page prefetches may
        // otherwise reuse a guest redirect after a successful sign-in.
        window.location.replace("/welcome");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
        // A new identity needs a fresh router cache; public-page prefetches may
        // otherwise reuse a guest redirect after a successful sign-in.
        window.location.replace("/welcome");
      }
    } catch (caught) {
      const code = authErrorCode(caught);
      if (["user_already_exists", "email_exists", "user_not_found"].includes(code) && ["signup", "confirm", "recovery"].includes(mode)) {
        setMessage(mode === "recovery" ? RECOVERY_MESSAGE : CONFIRMATION_MESSAGE);
        if (mode === "signup") { setPassword(""); setMode("confirm"); }
      } else setError(authErrorMessage(caught, mode));
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <header className="auth-header">
        <LeadlyLogo href="/" />
      </header>
      <div className="auth-layout">
        <AuthStory />
        <section className="auth-card">
          <h1 key={`title-${mode}`} className="auth-mode-content">
            {mode === "signup"
              ? "Начнём знакомство."
              : mode === "recovery"
                ? "Вернём доступ."
                : mode === "confirm"
                  ? "Подтверди почту."
                : "С возвращением."}
          </h1>
          <p
            key={`subtitle-${mode}`}
            className="auth-subtitle auth-mode-content"
          >
            {mode === "signup"
              ? "Создай аккаунт, чтобы находить заказы и вести проекты."
              : mode === "recovery"
                ? "Укажи email аккаунта — пришлём ссылку для смены пароля."
                : mode === "confirm"
                  ? "Запроси новое письмо, если не получилось подтвердить адрес."
                : "Войди, чтобы продолжить работу с возможностями."}
          </p>
          <div
            className="auth-tabs"
            role="tablist"
            aria-label="Тип авторизации"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? "active" : ""}
              disabled={busy}
              onClick={() => changeMode("signup")}
            >
              Регистрация
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              className={mode === "signin" ? "active" : ""}
              disabled={busy}
              onClick={() => changeMode("signin")}
            >
              Вход
            </button>
          </div>
          <form
            key={`form-${mode}`}
            className="auth-form auth-mode-content"
            onSubmit={handleSubmit}
          >
            {mode === "signup" && (
              <label>
                Как к тебе обращаться
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Имя"
                  maxLength={80}
                  disabled={busy}
                  required
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                maxLength={254}
                disabled={busy}
                required
              />
            </label>
            {(mode === "signin" || mode === "signup") && (
              <label>
                Пароль
                <div className="password-wrap">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Минимум 8 символов"
                    minLength={mode === "signup" ? 8 : 1}
                    maxLength={128}
                    disabled={busy}
                    required
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="password-toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={
                      showPassword ? "Скрыть пароль" : "Показать пароль"
                    }
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
            )}
            {mode === "signup" && (
              <div className="registration-consent">
                <label className="consent-control">
                  <input
                    type="checkbox"
                    checked={privacyAccepted}
                    onChange={(event) =>
                      setPrivacyAccepted(event.target.checked)
                    }
                    required
                    disabled={busy}
                    aria-label="Я ознакомился с условиями обработки персональных данных"
                  />
                  <span>
                    Я ознакомился с{" "}
                    <Link
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      условиями обработки персональных данных
                    </Link>
                    .
                  </span>
                </label>
              </div>
            )}
            {error && (
              <p className="auth-message error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="auth-message success" role="status">
                {message}
              </p>
            )}
            <button className="auth-submit" type="submit" disabled={busy || (mode !== "signin" && waitSeconds > 0)}>
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <>
                  {mode === "signup"
                    ? "Создать аккаунт"
                    : mode === "recovery"
                      ? "Отправить ссылку"
                      : mode === "confirm"
                        ? "Отправить письмо повторно"
                      : "Войти в LEADLY"}{" "}
                  <ArrowRight size={17} />
                </>
              )}
              {busy && "Обрабатываем..."}
            </button>
            {mode !== "signin" && waitSeconds > 0 && <p className="auth-subtitle">Повторный запрос через {waitSeconds} с.</p>}
          </form>
          <div className="auth-secondary-links">
            <button
              type="button"
              className="text-link"
              disabled={busy}
              style={{ border: 0, background: "none", padding: 0 }}
              onClick={() => changeMode(mode === "recovery" || mode === "confirm" ? "signin" : "recovery")}
            >
              {mode === "recovery" || mode === "confirm" ? "Вернуться ко входу" : "Забыли пароль?"}
            </button>
            {(mode === "signin" || mode === "signup") && <button type="button" className="text-link" disabled={busy} onClick={() => changeMode("confirm")}>Не пришло письмо подтверждения?</button>}
          </div>
          {(mode === "signin" || mode === "signup") && !busy && <SocialAuth options={socialOptions} intent={mode} />}
          <p className="auth-legal">
            Только необходимые cookies для входа. Без рекламного отслеживания.{" "}
            <Link href="/privacy#cookies">Подробнее</Link>
          </p>
        </section>
      </div>
      <footer className="auth-footer">
        <span>© {new Date().getFullYear()} LEADLY</span>
        <Link href="/privacy">Конфиденциальность</Link>
      </footer>
    </main>
  );
}
