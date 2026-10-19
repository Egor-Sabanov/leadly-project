"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { LeadlyLogo } from "@/components/brand/LeadlyLogo";
import { telegramDestination } from "@/lib/telegram-navigation";
import type { TelegramWebApp } from "@/lib/telegram-webapp";

export function TelegramLaunch({ botUsername }: { botUsername: string | null }) {
  const router = useRouter(), checked = useRef(false);
  const [app, setApp] = useState<TelegramWebApp | null>(null);
  const [state, setState] = useState("loading"), [label, setLabel] = useState(""), [error, setError] = useState("");
  const destination = () => telegramDestination(new URLSearchParams(window.location.search).get("next"));
  const welcome = () => router.replace(`/welcome?next=${encodeURIComponent(destination())}`);
  useEffect(() => {
    let active = true;
    const inspect = async () => {
      const current = window.Telegram?.WebApp;
      if (!current?.initData) { if (active) setState("outside"); return; }
      if (checked.current) return;
      checked.current = true; setApp(current);
      try {
        const response = await fetch("/api/telegram/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: current.initData, action: "check" }) });
        const body = await response.json();
        if (!active) return;
        if (response.status === 409 && body.code === "not_linked") { setState("unlinked"); return; }
        if (!response.ok) throw new Error(body.error || "Не удалось проверить вход.");
        // A fresh login always requires an explicit click on the verified
        // identity. A crafted launch URL cannot silently switch accounts.
        if (body.authenticated) { setState("authenticated"); return; }
        setLabel(body.label); setState("ready");
      } catch (reason) { if (active) { setError(reason instanceof Error ? reason.message : "Не удалось проверить вход."); setState("error"); } }
    };
    const failed = () => { if (active) { setState("error"); setError("Не удалось загрузить Telegram. Открой приложение заново или перейди на сайт."); } };
    window.addEventListener("leadly:telegram-ready", inspect); window.addEventListener("leadly:telegram-error", failed);
    if (window.Telegram?.WebApp) void inspect();
    const timer = setTimeout(() => { if (!checked.current && active) setState("outside"); }, 10000);
    return () => { active = false; checked.current = false; clearTimeout(timer); window.removeEventListener("leadly:telegram-ready", inspect); window.removeEventListener("leadly:telegram-error", failed); };
  }, []);
  useEffect(() => {
    if (state === "authenticated") router.replace(`/welcome?next=${encodeURIComponent(telegramDestination(new URLSearchParams(window.location.search).get("next")))}`);
  }, [state, router]);
  async function login() {
    if (!app?.initData) return;
    setState("loading"); setError("");
    try {
      const result = await fetch("/api/telegram/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: app.initData, action: "login" }) });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error || "Не удалось войти.");
      const session = await fetch("/api/telegram/session", { cache: "no-store", credentials: "same-origin" });
      if (!session.ok) throw new Error("Браузер не сохранил сессию. Открой Mini App в приложении Telegram или войди на сайте.");
      welcome();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось войти."); setState("error"); }
  }
  const openSite = () => { const url = new URL("/profile", window.location.origin).href; if (app) app.openLink(url); else window.location.assign(url); };
  return <main className="telegram-launch">
    <section className="panel telegram-launch-card" aria-labelledby="telegram-title">
      <LeadlyLogo />
      <div className="telegram-launch-line" aria-hidden="true" />
      <h1 id="telegram-title">Твой LEADLY.<br />Теперь в Telegram.</h1>
      <p className="muted">Возможности, отклики и дела — в твоём рабочем пространстве.</p>
      {state === "loading" || state === "authenticated" ? <p role="status" className="telegram-status"><LoaderCircle className="spin" size={20} /> Проверяем вход…</p> : null}
      {state === "ready" ? <button type="button" className="auth-submit" onClick={login}>Продолжить как {label}<ArrowUpRight size={18} /></button> : null}
      {state === "unlinked" ? <div className="telegram-entry-help"><h2>Подключи свой аккаунт</h2><p>Войди на сайте LEADLY, открой «Профиль → Telegram» и подтверди подключение. После этого здесь будут доступны твои данные.</p><button type="button" className="auth-submit" onClick={openSite}>Открыть профиль на сайте<ArrowUpRight size={18} /></button></div> : null}
      {state === "outside" ? <div className="telegram-entry-help"><p>Открой Mini App через кнопку приложения в боте.</p>{botUsername ? <a className="auth-submit" href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer">Перейти в @{botUsername}<ArrowUpRight size={18} /></a> : null}</div> : null}
      {error ? <p className="auth-message error" role="alert">{error}</p> : null}
      <div className="telegram-launch-footer"><button type="button" className="text-link" onClick={openSite}>Открыть сайт LEADLY</button><Link href="/privacy">Обработка данных</Link></div>
    </section>
  </main>;
}
