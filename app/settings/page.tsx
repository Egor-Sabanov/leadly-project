import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { getAccount } from "@/lib/workspace";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { SignOutButton } from "@/components/auth/SignOutButton";
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const account = await getAccount();
  const checks = [
    ["Подключение Supabase", !!process.env.NEXT_PUBLIC_SUPABASE_URL],
    [
      "Публичный ключ приложения",
      !!(
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ),
    ],
    [
      "Серверный импорт",
      !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.CRON_SECRET),
    ],
    [
      "Генерация откликов через AI",
      !!(
        process.env.LEADLY_AI_API_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY
      ),
    ],
    [
      "Telegram — разрешённые каналы",
      !!(
        process.env.TELEGRAM_WEBHOOK_SECRET &&
        process.env.TELEGRAM_ALLOWED_CHAT_IDS
      ),
    ],
  ] as const;
  return (
    <main className="app-shell">
      <Sidebar activeHref="/settings" />
      <section className="content">
        <PageHeader
          eyebrow="ПРОСТРАНСТВО ПОД КОНТРОЛЕМ"
          title="Настройки"
          description="Аккаунт, подключения и прозрачные границы автоматизации."
        />
        <div className="two-col">
          <section className="panel">
            <h2>Мой аккаунт</h2>
            <p className="muted">
              {account?.user.email || "Аккаунт ещё не подключён"}
            </p>
            <div className="checklist">
              <Link href="/profile">
                <span>
                  <strong>Личные данные и предпочтения</strong>
                  <small>Профиль, цель и настройки рекомендаций</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
              <Link href="/profile/skills">
                <span>
                  <strong>Навыки и услуги</strong>
                  <small>Каталог твоих сильных сторон</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
              <Link href="/sources">
                <span>
                  <strong>Источники возможностей</strong>
                  <small>Статус и происхождение данных</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
            </div>
            {account ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <SignOutButton />
                <span className="muted">Выйти из аккаунта</span>
              </div>
            ) : (
              <Link href="/auth" className="primary">
                Перейти ко входу
              </Link>
            )}
          </section>
          <section className="panel">
            <h2>Статус подключений</h2>
            {checks.map(([label, ok]) => (
              <div className="check-status" key={label}>
                <span>{label}</span>
                <span className="badge">{ok ? "ЗАДАНО" : "НЕ НАСТРОЕНО"}</span>
              </div>
            ))}
            <p className="profile-muted" style={{ marginTop: 20 }}>
              Здесь отображается наличие настроек, а не результат внешнего
              запроса. Секреты задаются в настройках среды и не выводятся в
              интерфейс.
            </p>
          </section>
        </div>
        <section className="panel" style={{ marginTop: 20 }}>
          <ShieldCheck size={23} />
          <h2 style={{ marginTop: 14 }}>Ты принимаешь решения</h2>
          <p className="muted">
            LEADLY помогает оценить и подготовить действия. Отклики не
            отправляются автоматически. Эвристическая оценка не гарантирует
            доход. При использовании AI выбранные данные профиля и предложения
            передаются настроенному провайдеру только после нажатия кнопки
            генерации.
          </p>
          <Link href="/privacy" className="text-link">
            Как обрабатываются данные ↗
          </Link>
        </section>
      </section>
    </main>
  );
}
