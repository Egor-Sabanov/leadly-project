"use client";
import { useState, useEffect, useRef, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck, LoaderCircle } from "lucide-react";
import { LeadlyLogo } from "@/components/brand/LeadlyLogo";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-feedback";
export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState("Проверяем ссылку восстановления…");
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => getSupabaseBrowserClient().auth.getUser())
      .then(({ data, error }) => {
        if (live) {
          setReady(!error && !!data.user);
          setMessage(
            error || !data.user
              ? "Ссылка недействительна или истекла. Запроси новую на странице входа."
              : "Задай новый пароль для своего аккаунта.",
          );
        }
      })
      .catch(() => {
        if (live)
          setMessage("Не удалось проверить ссылку. Проверь подключение.");
      });
    return () => {
      live = false;
    };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending.current || !ready) return;
    if (password !== repeat) {
      setMessage("Пароли не совпадают.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const { error } = await getSupabaseBrowserClient().auth.updateUser({
        password,
      });
      if (error) throw error;
      router.replace("/profile");
      router.refresh();
    } catch (e) {
      setMessage(authErrorMessage(e, "password"));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <header className="auth-header">
        <LeadlyLogo />
        <ShieldCheck size={20} />
      </header>
      <section className="auth-card">
        <div className="auth-kicker">ВОССТАНОВЛЕНИЕ ДОСТУПА</div>
        <h1>Снова в деле.</h1>
        <p className="auth-subtitle" role="status">
          {message}
        </p>
        {ready && (
          <form className="auth-form" onSubmit={submit}>
            <label>
              Новый пароль
              <input
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label>
              Повтори пароль
              <input
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <button className="auth-submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ArrowRight size={16} />
              )}
              Сохранить пароль
            </button>
          </form>
        )}
        <Link className="text-link" href="/auth?mode=recovery">
          Запросить новую ссылку
        </Link>
      </section>
    </main>
  );
}
