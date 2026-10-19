import Link from "next/link";
import { WorkTasks } from "@/components/workspace/WorkTasks";
import { Suspense } from "react";
import { IndustryNews } from "@/components/workspace/IndustryNews";
import { BrandMotion } from "@/components/brand/BrandMotion";
import { loadRussianOpportunities } from "@/lib/russian-opportunities";
import {
  ArrowUpRight,
  ArrowRight,
  Bookmark,
  Send,
  Target,
  UserRound,
  MessageSquareText,
  FolderKanban,
  Search,
} from "lucide-react";
import { getAccount, formatMoney, statusLabels } from "@/lib/workspace";
import { SetupScreen } from "@/components/layout/SetupScreen";
import { AvatarBadge } from "@/components/profile/AvatarBadge";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryError } from "@/components/layout/QueryError";
import { SignOutButton } from "@/components/auth/SignOutButton";
export const dynamic = "force-dynamic";
export default async function Home() {
  const account = await getAccount();
  if (!account) return <SetupScreen />;
  const { supabase, user } = account;
  const start = new Date();
  start.setUTCDate(1);
  const month = start.toISOString().slice(0, 10);
  const [profile, states, offers, recent] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name,headline,target_monthly_income,currency_code,timezone,onboarding_completed,avatar_url",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_opportunities")
      .select("status,is_saved")
      .eq("user_id", user.id),
    loadRussianOpportunities(supabase),
    supabase
      .from("opportunity_status_history")
      .select("id,to_status,changed_at,opportunity_id,opportunities(title)")
      .eq("user_id", user.id)
      .order("changed_at", { ascending: false })
      .limit(5),
  ]);
  const errors = [profile, states, offers, recent].find((r) => r.error)?.error;
  const p = profile.data;
  const rows = states.data || [];
  const sent = rows.filter((r) =>
    ["applied", "replied", "negotiating", "won"].includes(r.status),
  ).length;
  const name = p?.display_name || user.email?.split("@")[0] || "друг";
  const financial = await supabase
    .from("transactions")
    .select("amount,type")
    .eq("user_id", user.id)
    .eq("currency_code", p?.currency_code || "RUB")
    .gte("occurred_on", month)
    .lte("occurred_on", new Date().toISOString().slice(0, 10));
  const income = (financial.data || [])
    .filter((t) => t.type === "income")
    .reduce((n, t) => n + Number(t.amount), 0);
  const target = Number(p?.target_monthly_income || 0);
  const progress =
    target > 0 ? Math.min(100, Math.round((income / target) * 100)) : 0;
  return (
    <main className="app-shell">
      <Sidebar />
      <section className="content">
        <PageHeader
          eyebrow={new Date()
            .toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              weekday: "long",
              timeZone: p?.timezone || "Europe/Moscow",
            })
            .toUpperCase()}
          title={`Привет, ${name}.`}
          avatar={
            <Link
              href="/profile"
              className="greeting-avatar"
              aria-label="Изменить фото профиля"
            >
              <AvatarBadge
                url={
                  p?.avatar_url?.startsWith("/api/profile/avatar?")
                    ? p.avatar_url
                    : ""
                }
                name={name}
              />
            </Link>
          }
          description="Твои задания, текущие договорённости и результаты."
          action={
            <div className="topbar-actions">
              <span className="signed-in-email">{user.email}</span>
              <SignOutButton />
            </div>
          }
        />
        {errors && <QueryError message={errors.message} />}{" "}
        {financial.error && <QueryError message={financial.error.message} />}
        <section className="welcome-hero dashboard-focus">
          <BrandMotion variant="compact" />
          <div className="focus-copy">
            <span className="eyebrow">ПОДБОРКА ДЛЯ ТЕБЯ</span>
            <h2>
              Новые проекты.
              <br />
              Твои условия.
            </h2>
            <p>
              Выбирай задания по навыкам и бюджету. Сохраняй подходящие и веди
              переговоры в одном месте.
            </p>
            <Link className="primary" href="/opportunities">
              Найти возможность <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="focus-goal">
            <span className="eyebrow">ЦЕЛЬ МЕСЯЦА</span>
            <strong>
              {target > 0
                ? formatMoney(target, p?.currency_code || "RUB")
                : "Задай свою цель"}
            </strong>
            <p>
              {formatMoney(income, p?.currency_code || "RUB")} учтено в финансах
            </p>
            <div
              className="progress"
              role="progressbar"
              aria-label="Прогресс месячной цели"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${progress}%` }} />
            </div>
            <div className="focus-goal-footer">
              <span>{progress}% от цели</span>
              <Link href="/profile">
                Настроить <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        </section>
        <div className="stats">
          {[
            {
              label: "Возможности",
              value: offers.error ? "—" : offers.data.length,
              note: "В свежей подборке",
              icon: Search,
            },
            {
              label: "Сохранено",
              value: rows.filter((r) => r.is_saved).length,
              note: "В твоём личном списке",
              icon: Bookmark,
            },
            {
              label: "Откликов и диалогов",
              value: sent,
              note: "По отмеченным тобой статусам",
              icon: Send,
            },
            {
              label: "Результаты",
              value: rows.filter((r) => r.status === "won").length,
              note: "Твои достигнутые результаты",
              icon: Target,
            },
          ].map(({ label, value, note, icon: Icon }) => (
            <div className="stat" key={label}>
              <Icon size={18} className="stat-icon" />
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </div>
          ))}
        </div>
        <Suspense fallback={<div className="panel">Загружаем твои дела…</div>}>
          <WorkTasks compact />
        </Suspense>
        <div className="two-col">
          <section className="panel">
            <div className="section-heading" style={{ marginTop: 0 }}>
              <h2>Быстрый доступ</h2>
            </div>
            <div className="checklist">
              <Link href="/profile">
                <span className="step-number">
                  <UserRound size={18} />
                </span>
                <span>
                  <strong>Профиль и навыки</strong>
                  <small>Специализация, навыки, услуги и цель</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
              <Link href="/opportunities">
                <span className="step-number">
                  <Search size={18} />
                </span>
                <span>
                  <strong>Подборка заданий</strong>
                  <small>Найди проект по навыкам и бюджету</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
              <Link href="/ai-outreach">
                <span className="step-number">
                  <MessageSquareText size={18} />
                </span>
                <span>
                  <strong>Черновики откликов</strong>
                  <small>Добавь факты о себе и отредактируй текст</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
              <Link href="/crm">
                <span className="step-number">
                  <FolderKanban size={18} />
                </span>
                <span>
                  <strong>Переговоры и статусы</strong>
                  <small>Статусы, заметки и история в одном месте</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
            </div>
          </section>
          <section className="panel">
            <h2>Последние действия</h2>
            {recent.data?.length ? (
              recent.data.map((row) => {
                const relation = row.opportunities as unknown as {
                  title: string;
                } | null;
                return (
                  <div className="activity-item" key={row.id}>
                    <Link href={`/opportunities/${row.opportunity_id}`}>
                      {relation?.title || "Возможность"}
                    </Link>
                    <small>
                      {statusLabels[row.to_status]} ·{" "}
                      {new Date(row.changed_at).toLocaleDateString("ru-RU")}
                    </small>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">
                <UserRound size={27} />
                <h2>Здесь появятся твои действия</h2>
                <p>
                  Сохрани первое предложение или измени его статус — здесь
                  появятся твои действия.
                </p>
                <Link href="/opportunities" className="ghost">
                  Открыть ленту <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </section>
        </div>
        <Suspense
          fallback={
            <section
              className="panel news-loading"
              aria-label="Новости индустрии"
            >
              <h2>В индустрии</h2>
              <p className="muted">Загружаем публикации…</p>
            </section>
          }
        >
          <IndustryNews />
        </Suspense>
        <footer className="footer-note">
          <span>LEADLY</span>
          <Link href="/privacy">Конфиденциальность</Link>
        </footer>
      </section>
    </main>
  );
}
