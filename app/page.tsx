import Link from "next/link";
import { loadRussianOpportunities } from "@/lib/russian-opportunities";
import {
  ArrowUpRight,
  ArrowRight,
  Bookmark,
  Send,
  Target,
  UserRound,
  Check,
  Search,
} from "lucide-react";
import { getAccount, formatMoney, statusLabels } from "@/lib/workspace";
import { SetupScreen } from "@/components/layout/SetupScreen";
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
        "display_name,headline,target_monthly_income,currency_code,timezone,onboarding_completed",
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
          description="Собери фокус. Выбери возможность. Сделай следующий шаг."
          action={
            <div className="topbar-actions">
              <span className="signed-in-email">{user.email}</span>
              <SignOutButton />
            </div>
          }
        />
        {errors && <QueryError message={errors.message} />}{" "}
        {financial.error && <QueryError message={financial.error.message} />}
        <section className="welcome-hero">
          <span className="badge">ТВОЙ СЛЕДУЮЩИЙ ШАГ</span>
          <h2>
            Работа, в которой
            <br />
            есть твоя ценность.
          </h2>
          <p>
            Подходящие проекты и вакансии, понятная оценка и личная воронка.
            Всё, чтобы тратить время на возможности с перспективой.
          </p>
          <div className="hero-bottom">
            <Link className="primary" href="/opportunities">
              Найти возможность <ArrowUpRight size={17} />
            </Link>
            <div className="hero-target">
              <span>Твоя цель на месяц</span>
              <strong>
                {target > 0
                  ? formatMoney(target, p?.currency_code || "RUB")
                  : "Задай свою цель"}
              </strong>
              <Link href="/profile">Настроить профиль ↗</Link>
            </div>
          </div>
        </section>
        <div className="stats">
          {[
            {
              label: "Русскоязычных возможностей",
              value: offers.error ? "—" : offers.data.length,
              note: "В текущей выборке · до 100",
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
              label: "Успешных возможностей",
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
        <div className="two-col">
          <section className="panel">
            <div className="section-heading" style={{ marginTop: 0 }}>
              <h2>Твой маршрут</h2>
              <span className="badge">ПО ШАГАМ</span>
            </div>
            <div className="checklist">
              <Link href="/profile">
                <span className="step-number">
                  {p?.onboarding_completed ? <Check size={14} /> : "01"}
                </span>
                <span>
                  <strong>Настрой свой профиль</strong>
                  <small>Специализация, навыки, услуги и цель</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
              <Link href="/opportunities">
                <span className="step-number">02</span>
                <span>
                  <strong>Выбери подходящие предложения</strong>
                  <small>Проверь условия и объяснение оценки</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
              <Link href="/ai-outreach">
                <span className="step-number">03</span>
                <span>
                  <strong>Подготовь сильный отклик</strong>
                  <small>Добавь факты о себе и отредактируй текст</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
              <Link href="/crm">
                <span className="step-number">04</span>
                <span>
                  <strong>Доведи общение до результата</strong>
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
                <h2>История начинается с тебя</h2>
                <p>
                  Сохрани первое предложение или измени его статус — здесь
                  появятся твои действия.
                </p>
                <Link href="/opportunities" className="ghost">
                  Открыть ленту <ArrowRight size={15} />
                </Link>
              </div>
            )}
            <div className="section-heading">
              <h3>Цель месяца</h3>
              <span className="muted">{progress}%</span>
            </div>
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
            <p className="muted" style={{ fontSize: 14, marginTop: 12 }}>
              Учтено доходов: {formatMoney(income, p?.currency_code || "RUB")}.
              Записи добавляются в разделе финансов.
            </p>
          </section>
        </div>
        <footer className="footer-note">
          <span>LEADLY · Возможности становятся делом</span>
          <span>Твой темп. Твой следующий шаг.</span>
        </footer>
      </section>
    </main>
  );
}
