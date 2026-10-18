import { getAccount, statusLabels } from "@/lib/workspace";
import { Sidebar } from "@/components/layout/Sidebar";
import { SetupScreen } from "@/components/layout/SetupScreen";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryError } from "@/components/layout/QueryError";
export const dynamic = "force-dynamic";
export default async function AnalyticsPage() {
  const account = await getAccount();
  if (!account) return <SetupScreen />;
  const { supabase, user } = account;
  const now = new Date().getTime();
  const [states, history] = await Promise.all([
    supabase
      .from("user_opportunities")
      .select("status,is_saved")
      .eq("user_id", user.id)
      .limit(1000),
    supabase
      .from("opportunity_status_history")
      .select("to_status,changed_at")
      .eq("user_id", user.id)
      .gte("changed_at", new Date(now - 7 * 864e5).toISOString())
      .limit(5000),
  ]);
  const errors = states.error || history.error;
  const data = states.data || [];
  const sent = data.filter((i) =>
    ["applied", "replied", "negotiating", "won"].includes(i.status),
  ).length;
  const answers = data.filter((i) =>
    ["replied", "negotiating", "won"].includes(i.status),
  ).length;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * 864e5);
    const key = d.toISOString().slice(0, 10);
    return {
      label: d.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      value: (history.data || []).filter(
        (h) => h.changed_at.slice(0, 10) === key,
      ).length,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.value));
  return (
    <main className="app-shell">
      <Sidebar activeHref="/analytics" />
      <section className="content">
        <PageHeader
          eyebrow="ФОКУС НА ПРОГРЕССЕ"
          title="Аналитика"
          description="Как движутся твои возможности. Только действия и результаты из твоего аккаунта."
        />
        {errors ? (
          <QueryError message={errors.message} />
        ) : (
          <>
            <div className="stats">
              {[
                { label: "В работе и истории", value: data.length },
                { label: "Отмечено откликов", value: sent },
                { label: "Диалогов и результатов", value: answers },
                {
                  label: "Доля с ответом",
                  value: sent ? `${Math.round((answers / sent) * 100)}%` : "—",
                },
              ].map((i) => (
                <div className="stat" key={i.label}>
                  <span>{i.label}</span>
                  <strong>{i.value}</strong>
                  <small>По текущим статусам возможностей</small>
                </div>
              ))}
            </div>
            <div className="two-col">
              <section className="panel">
                <h2>Активность за 7 дней</h2>
                <p className="muted" style={{ fontSize: 14 }}>
                  Количество изменений статуса · дни по UTC
                </p>
                <div
                  className="bar-chart"
                  role="img"
                  aria-label={days
                    .map((d) => `${d.label}: ${d.value}`)
                    .join(", ")}
                >
                  {days.map((d) => (
                    <div key={d.label} className="bar-chart-item">
                      <strong>{d.value}</strong>
                      <div
                        className="bar-chart-bar"
                        style={{ height: Math.max(3, (d.value / max) * 140) }}
                      />
                      <span>{d.label}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel">
                <h2>Состояние воронки</h2>
                {Object.entries(statusLabels).map(([k, label]) => (
                  <div className="check-status" key={k}>
                    <span>{label}</span>
                    <strong>{data.filter((i) => i.status === k).length}</strong>
                  </div>
                ))}
              </section>
            </div>
            <p className="profile-muted" style={{ marginTop: 18 }}>
              До 1 000 возможностей и 5 000 действий. Расчёты отражают
              отмеченные тобой статусы; внешняя отправка сообщений и факт оплаты
              автоматически не проверяются.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
