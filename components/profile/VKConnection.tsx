"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Link2, LoaderCircle } from "lucide-react";
type Connection = { name: string; profileUrl: string };
type Status = {
  available: boolean;
  confirmedEmail?: boolean;
  connection?: Connection | null;
  pending?: (Connection & { expiresAt: string }) | null;
};

export function VKConnection() {
  const [status, setStatus] = useState<Status | null>(null),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [disconnect, setDisconnect] = useState(false);
  const guard = useRef(false);
  async function refresh() {
    const response = await fetch("/api/account/vk", { cache: "no-store" });
    if (!response.ok) throw Error("Не удалось проверить подключение VK.");
    setStatus(await response.json());
  }
  useEffect(() => {
    const controller = new AbortController();
    const url = new URL(location.href),
      failed = url.searchParams.get("vk") === "error";
    fetch("/api/account/vk", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw Error();
        return response.json();
      })
      .then((body) => {
        setStatus(body);
        if (failed)
          setError(
            "Подключение VK не завершено. Вернись к своему аккаунту VK и попробуй ещё раз.",
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus({ available: false });
      });
    if (failed) {
      url.searchParams.delete("vk");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    return () => controller.abort();
  }, []);
  const expiresAt = status?.pending?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    const timer = window.setTimeout(
      () => {
        setStatus((current) =>
          current ? { ...current, pending: null } : current,
        );
        setError("Подтверждение устарело. Подключи VK ещё раз.");
      },
      Math.max(0, Math.min(remaining, 300000)),
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  async function change(action: "start" | "confirm" | "cancel" | "disconnect") {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const path =
        action === "start" || action === "confirm"
          ? `/api/account/vk/${action}`
          : "/api/account/vk";
      const response = await fetch(path, {
        method:
          action === "cancel" || action === "disconnect" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "start"
            ? { intent: true }
            : { action, acknowledged: action === "confirm" ? consent : true },
        ),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Не удалось сохранить подключение VK.");
      if (action === "start") {
        const url = new URL(data.url);
        if (url.origin !== "https://id.vk.ru" || url.pathname !== "/authorize")
          throw Error("Не удалось открыть VK.");
        location.assign(url.href);
        return;
      }
      setConsent(false);
      setDisconnect(false);
      await refresh();
      setMessage(
        action === "confirm"
          ? "VK подключён. Теперь через него можно войти в этот кабинет."
          : action === "disconnect"
            ? "Вход через VK отключён."
            : "Подключение отменено.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось сохранить подключение VK.",
      );
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  if (!status?.available) return null;
  return (
    <section
      className="panel profile-section telegram-connection"
      id="vk"
      aria-labelledby="vk-connection-title"
    >
      <div className="profile-section-heading">
        <span className="onboarding-icon">
          <Link2 size={20} />
        </span>
        <div>
          <h2 id="vk-connection-title">ВКонтакте</h2>
          <p>Дополнительный способ входа в этот рабочий кабинет.</p>
        </div>
      </div>
      {status.connection ? (
        <>
          <p className="telegram-connected" role="status">
            Подключён <strong>{status.connection.name}</strong>
          </p>
          <a
            className="text-link"
            href={status.connection.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть профиль VK
            <ArrowUpRight size={15} />
          </a>
          {disconnect ? (
            <div className="telegram-entry-help">
              <p>
                Отключить вход через VK? Твой кабинет и данные сохранятся. Войти
                можно будет прежним способом.
              </p>
              <div className="telegram-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() => void change("disconnect")}
                >
                  Подтвердить отключение VK
                </button>
                <button
                  type="button"
                  className="text-link"
                  disabled={busy}
                  onClick={() => setDisconnect(false)}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="text-link"
              onClick={() => setDisconnect(true)}
            >
              Отключить VK
            </button>
          )}
        </>
      ) : status.pending ? (
        <>
          <div className="telegram-entry-help">
            <p>
              Выбран <strong>{status.pending.name}</strong>.
            </p>
            <a
              className="text-link"
              href={status.pending.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Проверить профиль VK
              <ArrowUpRight size={15} />
            </a>
            <p>
              Этот VK будет открывать текущий кабинет LEADLY. Данные других
              аккаунтов не переносятся. Подтверждение действует 5 минут.
            </p>
          </div>
          <label className="telegram-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Это мой профиль VK. Разрешаю использовать его для входа в текущий
              аккаунт LEADLY.
            </span>
          </label>
          <div className="telegram-actions">
            <button
              type="button"
              className="auth-submit"
              disabled={!consent || busy}
              onClick={() => void change("confirm")}
            >
              Подтвердить подключение VK
            </button>
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => void change("cancel")}
            >
              Отменить подключение VK
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Откроем VK, чтобы ты выбрал свой профиль. После возврата проверь его
            и подтверди подключение. LEADLY сохранит только идентификатор и имя
            VK для входа.
          </p>
          {!status.confirmedEmail ? (
            <p role="status">Сначала подтверди почту своего аккаунта LEADLY.</p>
          ) : null}
          <button
            type="button"
            className="ghost"
            disabled={busy || !status.confirmedEmail}
            onClick={() => void change("start")}
          >
            Подключить VK
            <ArrowUpRight size={17} />
          </button>
        </>
      )}
      {busy ? (
        <p className="telegram-status" role="status">
          <LoaderCircle size={16} className="spin" /> Сохраняем…
        </p>
      ) : null}
      {message ? (
        <p className="auth-message success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
