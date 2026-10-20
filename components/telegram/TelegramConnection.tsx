"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TelegramNotifications } from "./TelegramNotifications";
import { ArrowUpRight, LoaderCircle, Link2 } from "lucide-react";

type Status = { available: boolean; connection?: { telegram_username: string | null; linked_at: string } | null; pending?: { id: string; expires_at: string; telegram_user_id: number | null; telegram_username: string | null } | null };
export function TelegramConnection() {
  const [status, setStatus] = useState<Status | null>(null), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [url, setUrl] = useState("");
  const pendingChange = useRef(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/telegram/link", { cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось проверить подключение Telegram.");
    setStatus(await response.json());
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/telegram/link", { cache: "no-store", signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(body => setStatus(body))
      .catch(() => { if (!controller.signal.aborted) setStatus({ available: false }); });
    return () => controller.abort();
  }, []);
  const requestId = status?.pending?.id, connected = !!status?.connection;
  useEffect(() => {
    if (!requestId || connected) return;
    const check = () => { if (document.visibilityState === "visible") void refresh().catch(() => {}); };
    const timer = setInterval(check, 7000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [requestId, connected, refresh]);
  async function change(method: string, body?: object) {
    if (pendingChange.current) return;
    pendingChange.current = true;
    setBusy(true); setError("");
    try {
      const result = await fetch(method === "confirm" ? "/api/telegram/link/confirm" : "/api/telegram/link", {
        method: method === "confirm" ? "POST" : method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
      });
      const data = await result.json(); if (!result.ok) throw new Error(data.error || "Не удалось сохранить подключение.");
      if (data.url) setUrl(data.url); else setUrl("");
      setConfirmDisconnect(false); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить подключение."); }
    finally { pendingChange.current = false; setBusy(false); }
  }
  if (!status?.available) return null;
  const candidate = status.pending?.telegram_username ? `@${status.pending.telegram_username}` : `Telegram ID ${status.pending?.telegram_user_id}`;
  return <section className="panel profile-section telegram-connection" id="telegram" aria-labelledby="telegram-connection-title">
    <div className="profile-section-heading"><span className="onboarding-icon"><Link2 size={20} /></span><div><h2 id="telegram-connection-title">Telegram</h2><p>Твой рабочий кабинет в Mini App и быстрый доступ через бота.</p></div></div>
    {status.connection ? <><p className="telegram-connected" role="status">Подключён {status.connection.telegram_username ? `@${status.connection.telegram_username}` : "аккаунт Telegram"}</p>
      {confirmDisconnect ? <div className="telegram-entry-help"><p>Отключить Telegram? Новый вход через бота станет недоступен.</p><div className="telegram-actions"><button type="button" className="ghost" onClick={() => change("DELETE")} disabled={busy}>Отключить</button><button type="button" className="text-link" onClick={() => setConfirmDisconnect(false)} disabled={busy}>Отмена</button></div></div> : <button type="button" className="text-link" onClick={() => setConfirmDisconnect(true)}>Отключить Telegram</button>}</>
      : <>
        {!status.pending ? <><label className="telegram-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Подключить Telegram как дополнительный способ входа. LEADLY сохранит мой Telegram ID и имя пользователя. Личные переписки и контакты не нужны.</span></label><button type="button" className="ghost" disabled={!consent || busy} onClick={() => change("POST", { consent: true })}>Подключить Telegram<ArrowUpRight size={17} /></button></> : null}
        {status.pending && !status.pending.telegram_user_id ? <div className="telegram-entry-help"><p role="status">Открой бота и нажми Start. Затем вернись сюда для подтверждения. Ссылка действует 5 минут.</p>{url ? <a className="auth-submit" href={url} target="_blank" rel="noopener noreferrer">Открыть бота<ArrowUpRight size={17} /></a> : <button type="button" className="ghost" disabled={busy} onClick={() => change("POST", { consent: true })}>Создать новую ссылку</button>}</div> : null}
        {status.pending?.telegram_user_id ? <div className="telegram-entry-help"><p role="status">Запрос от <strong>{candidate}</strong>. Проверь, что это твой аккаунт.</p><button type="button" className="auth-submit" disabled={busy} onClick={() => change("confirm", { requestId: status.pending!.id })}>Подтвердить этот Telegram</button></div> : null}
        {status.pending ? <div className="telegram-actions"><button type="button" className="text-link" disabled={busy} onClick={() => refresh().catch(() => setError("Не удалось обновить статус."))}>Проверить подключение</button><button type="button" className="text-link" disabled={busy} onClick={() => change("DELETE")}>Отменить подключение</button></div> : null}
      </>}
    {busy ? <p className="telegram-status" role="status"><LoaderCircle className="spin" size={16} /> Сохраняем…</p> : null}
    {error ? <p className="auth-message error" role="alert">{error}</p> : null}
    {status.connection && <TelegramNotifications />}
    <p className="muted telegram-connection-note">Подключение не включает рекламные рассылки. Отключить связь можно здесь или командой /stop в боте.</p>
  </section>;
}
