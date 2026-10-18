"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="not-found">
      <span className="eyebrow">LEADLY</span>
      <h1>Не удалось открыть страницу.</h1>
      <p className="muted">
        Попробуй ещё раз. Если ошибка повторяется, проверь подключение
        приложения.
      </p>
      <button className="primary" onClick={reset}>
        Попробовать ещё раз
      </button>
    </main>
  );
}
