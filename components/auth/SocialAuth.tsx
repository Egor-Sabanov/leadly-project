import Link from "next/link";
import { CodeXml, ArrowUpRight } from "lucide-react";
import type { SocialAuthOption } from "@/lib/auth-providers";
function ProviderIcon({ id }: { id: SocialAuthOption["id"] }) {
  if (id === "github") return <CodeXml size={21} aria-hidden="true" />;
  if (id === "google")
    return (
      <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
        <path
          fill="currentColor"
          d="M21.8 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.5a4.8 4.8 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6ZM12 22c2.7 0 5-0.9 6.7-2.4l-3.3-2.6c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.1H3v2.7A10 10 0 0 0 12 22ZM6.4 13.8a6 6 0 0 1 0-3.6V7.5H3a10 10 0 0 0 0 9l3.4-2.7ZM12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.5l3.4 2.7c.8-2.4 3-4.1 5.6-4.1Z"
        />
      </svg>
    );
  return (
    <span className="social-letter" aria-hidden="true">
      {id === "vk" ? "vk" : "Я"}
    </span>
  );
}
export function SocialAuth({ options }: { options: SocialAuthOption[] }) {
  const active = options.some((o) => o.enabled);
  return (
    <section className="social-auth" aria-label="Вход через сервисы">
      <div className="social-auth-grid">
        {options.map((o) =>
          o.enabled ? (
            <Link
              key={o.id}
              href={`/auth/social/${o.id}`}
              className="social-auth-button"
            >
              <ProviderIcon id={o.id} />
              <span>{o.label}</span>
              <ArrowUpRight size={15} />
            </Link>
          ) : (
            <button
              key={o.id}
              type="button"
              className="social-auth-button"
              disabled
              aria-describedby="social-auth-status"
            >
              <ProviderIcon id={o.id} />
              <span>{o.label}</span>
              <span className="social-status">Не подключён</span>
            </button>
          ),
        )}
      </div>
      <p id="social-auth-status" className="social-auth-note">
        {active
          ? "Выбери сервис для безопасного входа. Пароль от него остаётся у провайдера."
          : "Вход через сервисы пока не подключён владельцем приложения. Регистрация по почте доступна после подключения аккаунтов."}
      </p>
      <div className="auth-divider">
        <span>или по электронной почте</span>
      </div>
    </section>
  );
}
