import Link from "next/link";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { getAccount } from "@/lib/workspace";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { CookieNoticeButton } from "@/components/privacy/CookieNotice";
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const account = await getAccount();
  return (
    <main className="app-shell">
      <Sidebar activeHref="/settings" />
      <section className="content">
        <PageHeader
          eyebrow="АККАУНТ"
          title="Настройки"
          description="Личные данные, доступ и конфиденциальность."
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
                  <strong>Профиль и предпочтения</strong>
                  <small>Специализация, цель и подборка заданий</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
              <Link href="/profile/skills">
                <span>
                  <strong>Навыки и услуги</strong>
                  <small>Опыт, который учитывается при подборе</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
            </div>
            {account ? (
              <div className="settings-signout">
                <SignOutButton />
                <span className="muted">Выйти из аккаунта</span>
              </div>
            ) : (
              <Link href="/auth" className="primary">
                Перейти ко входу
              </Link>
            )}
          </section>
          <section className="panel privacy-settings">
            <LockKeyhole size={22} aria-hidden="true" />
            <h2>Данные и приватность</h2>
            <p className="muted">
              Контакты, заметки и финансовые записи доступны в твоём аккаунте.
              LEADLY не отправляет отклики без твоего действия.
            </p>
            <details>
              <summary>Какие cookies используются</summary>
              <p>
                Только необходимые для авторизации и сохранения сессии.
                Рекламные cookies и сторонние системы отслеживания не
                подключены. Выход из аккаунта завершает сессию.
              </p>
            </details>
            <CookieNoticeButton />
            <Link href="/privacy" className="text-link">
              Обработка персональных данных <ArrowUpRight size={14} />
            </Link>
          </section>
        </div>
      </section>
    </main>
  );
}
