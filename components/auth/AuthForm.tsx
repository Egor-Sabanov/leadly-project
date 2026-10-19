"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SocialAuth } from "./SocialAuth";
import { socialAuthCatalog, type SocialAuthOption } from "@/lib/auth-providers";
import { LeadlyLogo } from "@/components/brand/LeadlyLogo";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";
import { AuthStory } from "@/components/brand/AuthStory";

type Mode = "signin" | "signup" | "recovery";

export function AuthForm({
  callbackFailed = false,
  socialOptions = socialAuthCatalog(),
  socialError,
}: {
  callbackFailed?: boolean;
  socialOptions?: SocialAuthOption[];
  socialError?: string;
}) {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(
    socialError ||
      (callbackFailed
        ? "Не удалось завершить вход: ссылка устарела или проверка сессии не прошла. Повтори вход либо запроси новое письмо."
        : ""),
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "signup" && !privacyAccepted) {
      setError("Ознакомься с условиями обработки данных перед регистрацией.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (mode === "recovery") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
          },
        );
        if (resetError) throw resetError;
        setMessage(
          "Если аккаунт с таким адресом существует, письмо со ссылкой восстановления отправлено.",
        );
        return;
      }
      if (mode === "signup") {
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
          setMessage(
            "Аккаунт создан. Проверь почту и подтверди адрес, затем войди в LEADLY.",
          );
          setMode("signin");
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
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось выполнить вход. Попробуй ещё раз.",
      );
    } finally {
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
              onClick={() => {
                setMode("signup");
                setError("");
                setMessage("");
              }}
            >
              Регистрация
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              className={mode === "signin" ? "active" : ""}
              onClick={() => {
                setMode("signin");
                setError("");
                setMessage("");
              }}
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
                required
              />
            </label>
            {mode !== "recovery" && (
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
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
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
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <>
                  {mode === "signup"
                    ? "Создать аккаунт"
                    : mode === "recovery"
                      ? "Отправить ссылку"
                      : "Войти в LEADLY"}{" "}
                  <ArrowRight size={17} />
                </>
              )}
              {busy && "Обрабатываем..."}
            </button>
          </form>
          <div className="auth-secondary-links">
            <button
              type="button"
              className="text-link"
              style={{ border: 0, background: "none", padding: 0 }}
              onClick={() => {
                setMode(mode === "recovery" ? "signin" : "recovery");
                setError("");
                setMessage("");
              }}
            >
              {mode === "recovery" ? "Вернуться ко входу" : "Забыли пароль?"}
            </button>
          </div>
          {mode !== "recovery" && <SocialAuth options={socialOptions} />}
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
