"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { LockKeyhole, Check } from "lucide-react";

const key = "leadly-cookie-notice";
const version = "necessary-v1";
const changed = "leadly-cookie-notice-changed";
const opened = "leadly-cookie-notice-open";
function subscribe(update: () => void) {
  window.addEventListener("storage", update);
  window.addEventListener(changed, update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener(changed, update);
  };
}
function needsNotice() {
  try {
    return window.localStorage.getItem(key) !== version;
  } catch {
    return true;
  }
}
export function CookieNotice() {
  const required = useSyncExternalStore(subscribe, needsNotice, () => false);
  const [override, setOverride] = useState<boolean | null>(null);
  const visible = override ?? required;
  const notice = useRef<HTMLElement>(null);
  useEffect(() => {
    const show = () => setOverride(true);
    window.addEventListener(opened, show);
    return () => window.removeEventListener(opened, show);
  }, []);
  useEffect(() => {
    const element = notice.current;
    if (!visible || !element) return;
    const root = document.documentElement;
    const size = () =>
      root.style.setProperty(
        "--cookie-notice-space",
        `${element.offsetHeight + 32}px`,
      );
    const observer = new ResizeObserver(size);
    observer.observe(element);
    size();
    return () => {
      observer.disconnect();
      root.style.removeProperty("--cookie-notice-space");
    };
  }, [visible]);
  function acknowledge() {
    try {
      window.localStorage.setItem(key, version);
    } catch {
      /* A blocked preference store must not block the application. */
    }
    setOverride(false);
    window.dispatchEvent(new Event(changed));
  }
  if (!visible) return null;
  return (
    <section
      ref={notice}
      className="cookie-notice"
      aria-label="Использование cookies"
    >
      <div className="cookie-notice-icon" aria-hidden="true">
        <LockKeyhole size={19} />
      </div>
      <div className="cookie-notice-content">
        <h2>Только необходимые cookies</h2>
        <p>
          Они сохраняют вход в аккаунт. Рекламных cookies и сторонних трекеров у
          нас нет.
        </p>
        <div className="cookie-notice-actions">
          <button type="button" className="primary" onClick={acknowledge}>
            <Check size={15} /> Понятно
          </button>
          <Link className="text-link" href="/privacy#cookies">
            Подробнее о cookies
          </Link>
        </div>
      </div>
    </section>
  );
}
export function CookieNoticeButton() {
  return (
    <button
      type="button"
      className="text-link cookie-notice-reopen"
      onClick={() => window.dispatchEvent(new Event(opened))}
    >
      Настройки cookies
    </button>
  );
}
