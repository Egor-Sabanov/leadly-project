import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Send } from "lucide-react";
import {
  getAccount,
  statusLabels,
  safeSourceUrl,
  formatMoney,
} from "@/lib/workspace";
import { SetupScreen } from "@/components/layout/SetupScreen";
import { Sidebar } from "@/components/layout/Sidebar";
import { QueryError } from "@/components/layout/QueryError";
import { OpportunityActions } from "@/components/opportunities/OpportunityActions";
export default async function OpportunityDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();
  const account = await getAccount();
  if (!account) return <SetupScreen />;
  const { supabase, user } = account;
  const [offer, state, history, score] = await Promise.all([
    supabase.from("opportunities").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("user_opportunities")
      .select("status,is_saved,notes")
      .eq("user_id", user.id)
      .eq("opportunity_id", id)
      .maybeSingle(),
    supabase
      .from("opportunity_status_history")
      .select("id,from_status,to_status,changed_at")
      .eq("user_id", user.id)
      .eq("opportunity_id", id)
      .order("changed_at", { ascending: false })
      .limit(30),
    supabase
      .from("opportunity_scores")
      .select("match_score,fit_score,explanation")
      .eq("user_id", user.id)
      .eq("opportunity_id", id)
      .eq("algorithm_version", "v14")
      .maybeSingle(),
  ]);
  const error = [offer, state, history, score].find((r) => r.error)?.error;
  if (!offer.data && !error) notFound();
  const o = offer.data;
  const exp = (score.data?.explanation || {}) as {
    reasons?: string[];
    cautions?: string[];
  };
  const url = safeSourceUrl(o?.source_url);
  const expired = o?.expires_at && new Date(o.expires_at) < new Date();
  return (
    <main className="app-shell">
      <Sidebar activeHref="/opportunities" />
      <section className="content">
        <Link
          href="/opportunities"
          className="ghost"
          style={{ marginBottom: 25 }}
        >
          <ArrowLeft size={15} />К возможностям
        </Link>
        {error && <QueryError message={error.message} />}
        {o && (
          <>
            <div className="topbar">
              <div>
                <div className="eyebrow">{o.company_name || "ПРЕДЛОЖЕНИЕ"}</div>
                <h1>{o.title}</h1>
                <div className="detail-meta">
                  <span className="badge">
                    {o.remote ? "Удалённо" : o.location || "Формат не указан"}
                  </span>
                  <span className="badge">
                    {o.published_at
                      ? new Date(o.published_at).toLocaleDateString("ru-RU")
                      : "Дата не указана"}
                  </span>
                </div>
              </div>
            </div>
            {(expired || !o.is_active) && (
              <p className="auth-message" role="note">
                Предложение закрыто или срок его действия истёк. Проверь
                актуальность у источника.
              </p>
            )}
            <div className="detail-layout">
              <div className="profile-form">
                <section className="panel">
                  <h2>О задаче</h2>
                  <div className="detail-description">
                    {String(
                      o.description || "Подробности доступны у источника.",
                    ).replace(/<[^>]*>/g, " ")}
                  </div>
                  <p className="muted" style={{ fontSize: 11, marginTop: 20 }}>
                    Описание предоставлено источником. Условия, бюджет и
                    доступность предложения нужно уточнять перед откликом.
                  </p>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ghost"
                    >
                      Открыть оригинал <ArrowUpRight size={15} />
                    </a>
                  )}
                </section>
                <section className="panel">
                  <h2>Почему это может подойти</h2>
                  {score.data ? (
                    <>
                      <div className="scores">
                        <div className="score">
                          <span>Совпадение</span>
                          <strong>{score.data.match_score}/100</strong>
                        </div>
                        <div className="score">
                          <span>Соответствие профилю</span>
                          <strong>{score.data.fit_score}/100</strong>
                        </div>
                      </div>
                      <ul>
                        {exp.reasons?.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                      {exp.cautions?.map((t) => (
                        <p className="auth-message" key={t}>
                          {t}
                        </p>
                      ))}
                    </>
                  ) : (
                    <p className="muted">
                      Персональная оценка появится после открытия ленты с
                      заполненным профилем.
                    </p>
                  )}
                </section>
                <section className="panel">
                  <h2>История действий</h2>
                  {history.data?.length ? (
                    <div className="timeline">
                      {history.data.map((h) => (
                        <div className="timeline-item" key={h.id}>
                          {statusLabels[h.from_status] || "Новая"} →{" "}
                          {statusLabels[h.to_status]}
                          <small>
                            {new Date(h.changed_at).toLocaleString("ru-RU")}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">Изменения статуса появятся здесь.</p>
                  )}
                </section>
              </div>
              <aside className="panel detail-sidebar">
                <div className="eyebrow">БЮДЖЕТ И ДЕЙСТВИЯ</div>
                <div className="budget">
                  {o.budget_min != null
                    ? `От ${formatMoney(Number(o.budget_min), o.currency_code)}`
                    : "Бюджет не указан"}
                </div>
                <p className="muted" style={{ fontSize: 11 }}>
                  Сумма из источника. Автоматически извлечённый бюджет требует
                  подтверждения.
                </p>
                <Link
                  href={`/ai-outreach?opportunity=${id}`}
                  className="primary full"
                >
                  <Send size={15} />
                  Подготовить отклик
                </Link>
                <hr
                  style={{
                    border: 0,
                    borderTop: "1px solid var(--border)",
                    margin: "22px 0",
                  }}
                />
                <OpportunityActions
                  key={state.data?.status + String(state.data?.is_saved)}
                  id={id}
                  initialStatus={state.data?.status}
                  initialSaved={state.data?.is_saved}
                  initialNotes={state.data?.notes}
                />
              </aside>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
