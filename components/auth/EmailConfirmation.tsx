"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { LeadlyLogo } from "@/components/brand/LeadlyLogo";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { authErrorMessage, type EmailConfirmation as Confirmation } from "@/lib/auth-feedback";

export function EmailConfirmation({ confirmation }: { confirmation: Confirmation | null }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const recovery = confirmation?.type === "recovery";
  useEffect(() => {
    // Keep the one-time credential out of copied URLs and subsequent history entries.
    // Rendering/prefetching this page never consumes it; verification needs a click.
    window.history.replaceState(window.history.state, "", "/auth/confirm");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmation || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await getSupabaseBrowserClient().auth.verifyOtp({ token_hash: confirmation.tokenHash, type: confirmation.type });
      if (result.error) throw result.error;
      if (!result.data.user || !result.data.session) throw new Error("No session");
      window.location.replace(recovery ? "/auth/reset" : "/welcome");
    } catch (caught) {
      setError(authErrorMessage(caught, "confirm"));
      pending.current = false;
      setBusy(false);
    }
  }
  return <main className="auth-shell">
    <header className="auth-header"><LeadlyLogo href="/auth" /></header>
    <section className="auth-card">
      <h1>{recovery ? "Восстановим доступ." : "Подтвердим почту."}</h1>
      <p className="auth-subtitle">{confirmation
        ? recovery ? "Продолжи, чтобы задать новый пароль для аккаунта из письма." : "Подтверди адрес, чтобы продолжить в аккаунте из письма."
        : "В ссылке не хватает данных или она повреждена. Запроси новое письмо."}</p>
      {confirmation && <form className="auth-form" onSubmit={submit}>
        {error && <p className="auth-message error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={busy} type="submit">
          {busy ? <LoaderCircle size={18} className="spin" /> : <ArrowRight size={18} />}
          {busy ? "Проверяем…" : recovery ? "Продолжить восстановление" : "Подтвердить и продолжить"}
        </button>
      </form>}
      <p className="auth-legal">Открывай только письма, которые запросил сам. Продолжение выполнит вход в аккаунт из этого письма.</p>
      <Link className="text-link" href={recovery ? "/auth?mode=recovery" : "/auth?mode=confirm"}>Запросить новое письмо</Link>
    </section>
  </main>;
}
