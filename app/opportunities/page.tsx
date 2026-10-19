import { loadRussianOpportunities } from "@/lib/russian-opportunities";
import { ChevronDown } from "lucide-react";
import { getAccount } from "@/lib/workspace";
import { SetupScreen } from "@/components/layout/SetupScreen";
import { Sidebar } from "@/components/layout/Sidebar";
import { OpportunityFeed } from "@/components/opportunities/OpportunityFeed";
import { scoreOpportunity } from "@/lib/opportunity-scoring";

export const dynamic = "force-dynamic";

type RawMetadata = Record<string, unknown>;

function asMetadata(value: unknown): RawMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as RawMetadata;
}

function metadataString(metadata: RawMetadata, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

export default async function OpportunitiesPage() {
  const account = await getAccount();
  if (!account) return <SetupScreen />;
  const { supabase, user } = account;

  const [
    { data: opportunities, error: opportunitiesError },
    { data: userStates, error: statesError },
    { data: profile, error: profileError },
    { data: preferences, error: preferencesError },
    { data: userSkills, error: userSkillsError },
    { data: userServices, error: userServicesError },
  ] = await Promise.all([
    loadRussianOpportunities(supabase),
    supabase
      .from("user_opportunities")
      .select("opportunity_id,status,is_saved")
      .eq("user_id", user.id),
    supabase
      .from("profiles")
      .select("headline,skills_summary,target_monthly_income,currency_code")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_preferences")
      .select("preferred_opportunity_types,preferred_competition,remote_only")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profile_skills")
      .select("level,years_experience,is_primary,skills(name)")
      .eq("user_id", user.id),
    supabase
      .from("profile_services")
      .select("services(name)")
      .eq("user_id", user.id),
  ]);

  const stateError =
    opportunitiesError ||
    statesError ||
    profileError ||
    preferencesError ||
    userSkillsError ||
    userServicesError;
  const stateById = new Map(
    (userStates || []).map((row) => [row.opportunity_id, row]),
  );
  const typedUserSkills = (userSkills || []) as unknown as Array<{
    level: number | null;
    years_experience: number | null;
    is_primary: boolean | null;
    skills: { name: string } | null;
  }>;
  const skillDetails = typedUserSkills
    .map((row) => ({
      name: row.skills?.name || "",
      level: row.level,
      yearsExperience: row.years_experience,
      isPrimary: row.is_primary,
    }))
    .filter((skill) => Boolean(skill.name));
  const catalogSkillNames = skillDetails.map((skill) => skill.name);
  const textSkillNames = (profile?.skills_summary || "")
    .split(/[,;\n]+/)
    .map((name: string) => name.trim())
    .filter(Boolean);
  const skillNames = [...new Set([...catalogSkillNames, ...textSkillNames])];
  const serviceNames = (
    (userServices || []) as unknown as Array<{
      services: { name: string } | null;
    }>
  )
    .map((row) => row.services?.name)
    .filter((name): name is string => Boolean(name));

  const eligibleOpportunities = (opportunities || []).filter(
    (item) => !preferences?.remote_only || item.remote,
  );
  const scoredRows = eligibleOpportunities.map((item) => {
    const metadata = asMetadata(item.raw_metadata);

    return {
      opportunity_id: item.id,
      user_id: user.id,
      scored_at: new Date().toISOString(),
      ...scoreOpportunity(
        {
          headline: profile?.headline,
          skillNames,
          skillDetails,
          serviceNames,
          targetMonthlyIncome: profile?.target_monthly_income,
          currencyCode: profile?.currency_code,
          preferredTypes: preferences?.preferred_opportunity_types,
          preferredCompetition: preferences?.preferred_competition,
          remoteOnly: preferences?.remote_only,
        },
        {
          ...item,
          budget_confidence: metadataString(metadata, "budget_confidence"),
          budget_extraction: metadataString(metadata, "budget_extraction"),
          budget_period: metadataString(metadata, "budget_period"),
          currency_evidence: metadataString(metadata, "currency_evidence"),
        },
      ),
    };
  });

  let scoreError: { message: string } | null = null;
  if (scoredRows.length && !stateError) {
    const { error } = await supabase
      .from("opportunity_scores")
      .upsert(scoredRows, {
        onConflict: "opportunity_id,user_id,algorithm_version",
      });
    if (error) scoreError = { message: error.message };
  }

  const scoreById = new Map(scoredRows.map((row) => [row.opportunity_id, row]));
  const items = eligibleOpportunities.map((item) => ({
    ...item,
    status: stateById.get(item.id)?.status || "new",
    is_saved: stateById.get(item.id)?.is_saved || false,
    match_score: scoreById.get(item.id)?.match_score ?? null,
    fit_score: scoreById.get(item.id)?.fit_score ?? null,
    matched_keywords:
      scoreById.get(item.id)?.explanation.matched_keywords ?? [],
    score_reasons: scoreById.get(item.id)?.explanation.reasons ?? [],
    score_cautions: scoreById.get(item.id)?.explanation.cautions ?? [],
    money_score: scoreById.get(item.id)?.money_score ?? null,
    money_score_status:
      scoreById.get(item.id)?.explanation.money_score_status ??
      "missing_budget",
    competition_score: scoreById.get(item.id)?.competition_score ?? null,
  }));

  return (
    <main className="app-shell">
      <Sidebar activeHref="/opportunities" />
      <section className="content profile-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">ПОДБОРКА</div>
            <h1>Возможности</h1>
            <p>Русскоязычные задания и вакансии под твои навыки.</p>
          </div>
        </header>

        <div className="opportunities-intro panel">
          <details className="feed-intro-details">
            <summary>
              <span>
                О ленте <ChevronDown size={14} aria-hidden="true" />
              </span>
              <span className="opportunities-count">
                {items.length} предложений
              </span>
            </summary>
            <p>
              Сохраняй интересные предложения и отслеживай их статус. Оценка
              совпадения учитывает навыки и услуги из профиля, тип и свежесть
              предложения. Финансовая оценка отдельно учитывает достоверность
              бюджета, валюту и период оплаты.
            </p>
          </details>
        </div>

        {stateError ? (
          <div className="panel opportunity-empty" role="alert">
            <h2>Не удалось загрузить возможности</h2>
            <p>{stateError.message}</p>
            <p>
              Проверь миграции Supabase и политики доступа к таблицам
              opportunities, user_opportunities, profile_skills и
              profile_services.
            </p>
          </div>
        ) : (
          <>
            <OpportunityFeed
              opportunities={items}
              emptyBecauseRemoteOnly={Boolean(
                preferences?.remote_only &&
                opportunities.length &&
                !eligibleOpportunities.length,
              )}
            />
            {scoreError && (
              <p className="auth-message" role="status">
                Оценки рассчитаны для этой загрузки, но не удалось сохранить их
                в историю: {scoreError.message}
              </p>
            )}
          </>
        )}

        <p className="opportunities-note">
          Оригинал публикации доступен в каждой карточке. Оценка показывает
          совпадения с профилем и не гарантирует получение работы.
        </p>
      </section>
    </main>
  );
}
