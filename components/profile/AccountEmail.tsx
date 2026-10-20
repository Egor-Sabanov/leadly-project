"use client";
import { useState, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
/** Email is optional for VK web login, and proved separately for mail recovery. */
export function AccountEmail({ initialEmail = "", confirmed = false }: { initialEmail?: string; confirmed?: boolean }) {
  const [email, setEmail] = useState(initialEmail), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const pending = useRef(false);
  if (confirmed) return null;
  async function save() {
    if (pending.current) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) { setError("Укажи действующий адрес почты."); return; }
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const client = getSupabaseBrowserClient();
      const result = email === initialEmail ? await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: location.origin + "/auth/callback" } }) : await client.auth.updateUser({ email }, { emailRedirectTo: location.origin + "/auth/callback" });
      if (result.error) throw new Error();
      setMessage("Проверь почту и перейди по ссылке в письме. После подтверждения обнови эту страницу.");
    } catch { setError("Не удалось отправить письмо. Проверь адрес и попробуй ещё раз."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="panel profile-section" aria-labelledby="account-email-title"><h2 id="account-email-title">Почта для доступа</h2><p className="muted">Через VK можно входить без почты. Подтверждённый адрес понадобится для восстановления доступа и входа в этот кабинет через Telegram.</p><label className="profile-field"><span>Электронная почта</span><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} maxLength={254} /></label><button type="button" className="ghost" onClick={save} disabled={busy}>{busy ? "Отправляем…" : "Подтвердить почту"}</button>{message && <p role="status">{message}</p>}{error && <p role="alert" className="auth-message error">{error}</p>}</section>;
}
