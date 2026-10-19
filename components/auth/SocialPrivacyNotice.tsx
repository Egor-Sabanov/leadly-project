"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { LeadlyLogo } from "@/components/brand/LeadlyLogo";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";

export function SocialPrivacyNotice() {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accepted || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accepted: true,
          version: PRIVACY_NOTICE_VERSION,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          body?.error ||
            "Не удалось сохранить подтверждение. Попробуй ещё раз.",
        );
      window.location.replace("/welcome");
    } catch (caught) {
      setError(
        caught instanceof Error && caught.name !== "TimeoutError"
          ? caught.message
          : "Сервер долго не отвечает. Попробуй ещё раз.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell social-notice-shell">
      <header className="auth-header">
        <LeadlyLogo />
        <SignOutButton />
      </header>
      <section className="auth-card social-notice-card">
        <span className="eyebrow">ПЕРЕД НАЧАЛОМ</span>
        <h1>Твой аккаунт готов.</h1>
        <p className="auth-subtitle">
          Ознакомься с тем, как LEADLY хранит профиль и рабочие записи. Пароль
          от соцсети остаётся у неё.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label className="consent-control">
            <input
              type="checkbox"
              required
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              disabled={busy}
            />
            <span>
              Я ознакомился с{" "}
              <Link href="/privacy" target="_blank" rel="noopener noreferrer">
                условиями обработки персональных данных
              </Link>
              .
            </span>
          </label>
          <p className="muted">
            Подтверждение не подключает рекламу или рассылки.
          </p>
          {error && (
            <p className="auth-message error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="auth-submit"
            disabled={busy || !accepted}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ArrowRight size={17} />
            )}
            {busy ? "Сохраняем…" : "Продолжить в LEADLY"}
          </button>
        </form>
      </section>
    </main>
  );
}
