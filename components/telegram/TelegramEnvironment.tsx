"use client";
import Script from "next/script";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { telegramInset } from "@/lib/telegram-navigation";
import type { TelegramWebApp } from "@/lib/telegram-webapp";

const subscribe = (callback: () => void) => {
  window.addEventListener("pageshow", callback);
  window.addEventListener("leadly:telegram-ready", callback);
  return () => { window.removeEventListener("pageshow", callback); window.removeEventListener("leadly:telegram-ready", callback); };
};
const telegramCookie = () => /(?:^|;\s*)leadly-tg=1(?:;|$)/.test(document.cookie);
export function TelegramEnvironment() {
  const path = usePathname(), router = useRouter();
  const [app, setApp] = useState<TelegramWebApp | null>(null);
  const telegram = useSyncExternalStore(subscribe, telegramCookie, () => false);
  const load = path === "/telegram" || telegram;
  useEffect(() => {
    if (!app?.initData) return;
    document.documentElement.classList.add("telegram-mode");
    app.ready(); app.expand();
    try { app.setHeaderColor?.("#101010"); app.setBackgroundColor?.("#101010"); app.setBottomBarColor?.("#101010"); } catch { /* Older Telegram clients keep their own chrome colors. */ }
    const viewport = () => {
      const style = document.documentElement.style;
      const top = telegramInset(app.safeAreaInset?.top) + telegramInset(app.contentSafeAreaInset?.top);
      const bottom = telegramInset(app.safeAreaInset?.bottom) + telegramInset(app.contentSafeAreaInset?.bottom);
      style.setProperty("--leadly-tg-top", `${top}px`);
      style.setProperty("--leadly-tg-bottom", `${bottom}px`);
      if (app.viewportStableHeight && app.viewportStableHeight > 100)
        style.setProperty("--leadly-tg-height", `${app.viewportStableHeight}px`);
    };
    viewport();
    const events = ["viewportChanged", "safeAreaChanged", "contentSafeAreaChanged"];
    for (const event of events) app.onEvent(event, viewport);
    window.dispatchEvent(new Event("leadly:telegram-ready"));
    return () => { for (const event of events) app.offEvent(event, viewport); };
  }, [app]);
  useEffect(() => {
    if (!app?.initData) return;
    const back = () => router.back();
    if (["/", "/telegram", "/welcome"].includes(path)) app.BackButton.hide();
    else { app.BackButton.show(); app.BackButton.onClick(back); }
    return () => app.BackButton.offClick(back);
  }, [app, path, router]);
  return load ? <Script id="telegram-web-app" src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive"
    onReady={() => { const current = window.Telegram?.WebApp; if (current) setApp(current); window.dispatchEvent(new Event("leadly:telegram-ready")); }}
    onError={() => window.dispatchEvent(new Event("leadly:telegram-error"))} /> : null;
}
