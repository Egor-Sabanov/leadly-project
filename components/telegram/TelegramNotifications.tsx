"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, LoaderCircle } from "lucide-react";
type Settings = { opportunities_enabled: boolean; tasks_enabled: boolean; disabled_reason: string | null; opportunity_frequency?: "daily" | "updates" };
type State = { available: boolean; settings?: Settings };
export function TelegramNotifications() {
  const [state, setState] = useState<State | null>(null), [jobs, setJobs] = useState(false), [tasks, setTasks] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "updates">("updates");
  const pending = useRef(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/telegram/notifications", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить уведомления.");
      if (!controller.signal.aborted) { setState(data); setJobs(data.settings?.opportunities_enabled === true); setTasks(data.settings?.tasks_enabled === true); setFrequency(data.settings?.opportunity_frequency || "daily"); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Не удалось загрузить уведомления."); });
    return () => controller.abort();
  }, [attempt]);
  const changed = (jobs && frequency !== (state?.settings?.opportunity_frequency || "daily")) || jobs !== (state?.settings?.opportunities_enabled || false) || tasks !== (state?.settings?.tasks_enabled || false);
  async function change(test = false) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(test ? "/api/telegram/notifications/test" : "/api/telegram/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(test ? { send: true } : { opportunities: jobs, tasks, frequency, consent: jobs || tasks }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить уведомления.");
      if (test) {
        const messages: Record<string, string> = { sent: "Проверочное сообщение отправлено. Открой чат с ботом.", already_sent: "Проверочное сообщение уже отправлялось сегодня. Посмотри чат с ботом.", disabled: "Сначала включи и сохрани хотя бы один вид уведомлений.", blocked: "Разблокируй бота в Telegram, затем включи уведомления снова.", uncertain: "Не удалось подтвердить доставку. Проверь чат с ботом.", prepared: "Проверка уже выполняется. Посмотри чат чуть позже.", sending: "Проверка уже выполняется. Посмотри чат чуть позже." };
        if (!messages[data.status]) throw new Error("Не удалось отправить проверку. Попробуй позже.");
        setNotice(messages[data.status]);
        if (data.status === "blocked") { setJobs(false); setTasks(false); setState({ available: true, settings: { opportunities_enabled: false, tasks_enabled: false, disabled_reason: "blocked" } }); }
      } else { setState({ available: true, settings: { opportunities_enabled: jobs, tasks_enabled: tasks, disabled_reason: null, opportunity_frequency: frequency } }); setNotice(jobs || tasks ? "Уведомления сохранены." : "Автоматические уведомления выключены."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить уведомления."); }
    finally { pending.current = false; setBusy(false); }
  }
  if (state?.available === false) return null;
  return <div className="telegram-entry-help" aria-labelledby="telegram-notifications-title">
    <h3 id="telegram-notifications-title"><Bell size={17} aria-hidden="true" /> Уведомления в Telegram</h3>
    <p>Новые задания — после обновления ленты или одной сводкой в день. Напоминания о делах — утром по твоему времени.</p>
    {state && <>
      <label className="telegram-consent"><input type="checkbox" checked={jobs} onChange={event => setJobs(event.target.checked)} disabled={busy} /><span>Получать новые задания по моему профилю. Без заполненного профиля — из общей ленты.</span></label>
      {jobs && <label className="profile-field"><span>Когда присылать новые задания</span><select value={frequency} onChange={event => setFrequency(event.target.value as "daily" | "updates")} disabled={busy}><option value="updates">После обновления ленты</option><option value="daily">Раз в день</option></select></label>}
      <label className="telegram-consent"><input type="checkbox" checked={tasks} onChange={event => setTasks(event.target.checked)} disabled={busy} /><span>Напоминать о сегодняшних и просроченных делах. Их названия будут видны в сообщении Telegram.</span></label>
      <p className="muted">Лента проверяется каждые 10 минут. Сообщения приходят только при появлении новых подходящих заданий после включения. Отключить сообщения можно здесь или кнопкой «Тишина» в боте; подключение аккаунта сохранится.</p>
      {state.settings?.disabled_reason === "blocked" && <p role="status">Бот заблокирован. Разблокируй его в Telegram перед включением уведомлений.</p>}
      <div className="telegram-actions"><button type="button" className="ghost" disabled={busy || !changed} onClick={() => change()}>Сохранить уведомления</button><button type="button" className="text-link" disabled={busy || changed || !(jobs || tasks)} onClick={() => change(true)}>Отправить мне проверку</button></div>
      <p className="muted">Проверка отправляет одно короткое сообщение в твой чат с ботом, не чаще раза в день.</p>
    </>}
    {!state && !error && <p role="status">Загружаем уведомления…</p>}
    {!state && error && <button type="button" className="text-link" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Повторить загрузку уведомлений</button>}
    {busy && <p className="telegram-status" role="status"><LoaderCircle className="spin" size={16} /> Сохраняем…</p>}
    {notice && <p className="auth-message success" role="status">{notice}</p>}
    {error && <p className="auth-message error" role="alert">{error}</p>}
  </div>;
}
