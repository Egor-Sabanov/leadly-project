"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  LoaderCircle,
  Save,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { Plans } from "@/components/profile/Plans";
import { Sidebar } from "@/components/layout/Sidebar";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Profile = {
  display_name: string | null;
  headline: string | null;
  skills_summary: string | null;
  target_monthly_income: number | null;
  onboarding_completed: boolean | null;
  currency_code: string | null;
};

type Preferences = {
  preferred_opportunity_types: string[] | null;
  preferred_competition: string[] | null;
  remote_only: boolean | null;
  ai_recommendations_enabled: boolean | null;
  telegram_notifications_enabled: boolean | null;
};

function splitLegacyProfileText(value: string): {
  specialization: string;
  skills: string;
} {
  const entries = value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!entries.length) return { specialization: "", skills: "" };

  const specializationPattern =
    /разработк|создан|mvp|saas|сайт|веб.?прилож|интернет.?магазин|автоматизац|интеграц|crm|веб.?разработ/i;
  const technologyPattern =
    /^(typescript|ts|javascript|js|react(?:\.js)?|next(?:\.js)?|node(?:\.js)?|nestjs|supabase|postgres(?:ql)?|sql|rest\s*api|html|css|tailwind|php|python|git|docker|ai|ml)$/i;
  const specializationEntries = entries.filter((part) =>
    specializationPattern.test(part),
  );
  const skillEntries = entries.filter(
    (part) => !specializationPattern.test(part),
  );

  if (
    specializationEntries.length ||
    skillEntries.some((part) => technologyPattern.test(part))
  ) {
    return {
      specialization: specializationEntries.join(", "),
      skills: skillEntries.join(", "),
    };
  }

  // Keep a single unclassified legacy value as specialization rather than discarding it.
  return { specialization: value.trim(), skills: "" };
}

const opportunityTypes = [
  { value: "freelance", label: "Фриланс" },
  { value: "project", label: "Разовые проекты" },
  { value: "client", label: "Поиск клиентов" },
  { value: "job", label: "Вакансии и подработки" },
];

export default function ProfilePage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [skillsSummary, setSkillsSummary] = useState("");
  const [income, setIncome] = useState("100000");
  const [currency, setCurrency] = useState("RUB");
  const [types, setTypes] = useState<string[]>([
    "freelance",
    "project",
    "client",
  ]);
  const [remoteOnly, setRemoteOnly] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          router.replace("/auth");
          return;
        }
        const [
          { data: profile, error: profileError },
          { data: preferences, error: preferencesError },
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select(
              "display_name,headline,skills_summary,target_monthly_income,onboarding_completed,currency_code",
            )
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("user_preferences")
            .select(
              "preferred_opportunity_types,preferred_competition,remote_only,ai_recommendations_enabled,telegram_notifications_enabled",
            )
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);
        if (profileError) throw profileError;
        if (preferencesError) throw preferencesError;
        if (!active) return;
        setUserId(user.id);
        setEmail(user.email || "");
        const p = profile as Profile | null;
        const prefs = preferences as Preferences | null;
        setName(
          p?.display_name ||
            String(
              user.user_metadata?.display_name ||
                user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                "",
            ),
        );
        const legacyProfileText = p?.headline || "";
        const legacyParts = splitLegacyProfileText(legacyProfileText);
        setHeadline(
          p?.skills_summary == null
            ? legacyParts.specialization
            : legacyProfileText,
        );
        setSkillsSummary(p?.skills_summary ?? legacyParts.skills);
        setCurrency(p?.currency_code || "RUB");
        setIncome(
          p?.target_monthly_income == null
            ? "100000"
            : String(p.target_monthly_income),
        );
        setTypes(
          prefs?.preferred_opportunity_types?.length
            ? prefs.preferred_opportunity_types
            : ["freelance", "project", "client"],
        );
        setRemoteOnly(prefs?.remote_only ?? true);
        setAiEnabled(prefs?.ai_recommendations_enabled ?? true);
        setTelegramEnabled(prefs?.telegram_notifications_enabled ?? true);
      } catch (caught) {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Не удалось загрузить настройки профиля.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadProfile();
    return () => {
      active = false;
    };
  }, [router]);

  function toggleType(value: string) {
    setTypes((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!userId) {
      setError("Сессия не найдена. Войди в аккаунт заново.");
      return;
    }
    if (!name.trim()) {
      setError("Укажи имя.");
      return;
    }
    if (!types.length) {
      setError("Выбери хотя бы один тип возможностей.");
      return;
    }
    const target = Number(income);
    if (!Number.isFinite(target) || target < 0 || target > 1_000_000_000) {
      setError("Укажи корректную цель дохода.");
      return;
    }
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: saveError } = await supabase.rpc("leadly_save_profile", {
        p_name: name.trim(),
        p_headline: headline.trim(),
        p_skills: skillsSummary.trim(),
        p_income: target,
        p_currency: currency,
        p_types: types,
        p_remote: remoteOnly,
        p_ai: aiEnabled,
        p_telegram: telegramEnabled,
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (saveError) throw saveError;
      setSuccess("Профиль и предпочтения сохранены.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось сохранить изменения. Попробуй ещё раз.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <Sidebar activeHref="/profile" />
      <section className="content profile-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">ТВОИ НАСТРОЙКИ</div>
            <h1>Мой профиль</h1>
            <p>
              Расскажи LEADLY, какие возможности искать и какой результат тебе
              нужен.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/profile/skills" className="ghost">
              Навыки и услуги
            </Link>
            <Link href="/" className="ghost">
              <ArrowLeft size={15} /> На главную
            </Link>
          </div>
        </header>

        {loading ? (
          <div className="panel profile-loading">
            <LoaderCircle size={22} className="spin" /> Загружаем профиль…
          </div>
        ) : (
          <form className="profile-form" onSubmit={saveProfile}>
            <section className="panel profile-section">
              <div className="profile-section-heading">
                <span className="onboarding-icon">
                  <UserRound size={20} />
                </span>
                <div>
                  <h2>О тебе</h2>
                  <p>
                    Эти данные будут использоваться в персональных
                    рекомендациях.
                  </p>
                </div>
              </div>
              <label className="profile-label">
                Email аккаунта
                <input value={email} readOnly />
              </label>
              <label className="profile-label">
                Как к тебе обращаться
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Твоё имя"
                  required
                />
              </label>
              <label className="profile-label">
                Специализация
                <input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  maxLength={140}
                  placeholder="Например, дизайн интерфейсов, маркетинг или разработка"
                />
              </label>
              <label className="profile-label">
                Навыки и технологии
                <input
                  value={skillsSummary}
                  onChange={(e) => setSkillsSummary(e.target.value)}
                  maxLength={1000}
                  placeholder="Например, Figma, копирайтинг, SEO, React"
                />
              </label>
            </section>

            <section className="panel profile-section">
              <div className="profile-section-heading">
                <span className="onboarding-icon">
                  <Target size={20} />
                </span>
                <div>
                  <h2>Цель и типы возможностей</h2>
                  <p>Настрой направление поиска под свои планы.</p>
                </div>
              </div>
              <label className="profile-label">
                Желаемый доход в месяц
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="1000000000"
                  step="1000"
                  value={income}
                  onChange={(e) => setIncome(e.target.value)}
                  required
                />
              </label>
              <label className="profile-label">
                Валюта цели
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="RUB">Рубли · RUB</option>
                  <option value="USD">Доллары · USD</option>
                  <option value="EUR">Евро · EUR</option>
                </select>
              </label>
              <fieldset className="work-types">
                <legend>Что искать?</legend>
                <div className="work-type-grid">
                  {opportunityTypes.map((type) => (
                    <button
                      type="button"
                      key={type.value}
                      className={`work-type ${types.includes(type.value) ? "selected" : ""}`}
                      aria-pressed={types.includes(type.value)}
                      onClick={() => toggleType(type.value)}
                    >
                      <span className="work-check">
                        {types.includes(type.value) ? "✓" : ""}
                      </span>
                      <strong>{type.label}</strong>
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="switch-row">
                <span>
                  <strong>Только удалённые возможности</strong>
                  <small>Скрывать предложения с обязательным офисом</small>
                </span>
                <input
                  type="checkbox"
                  checked={remoteOnly}
                  onChange={(e) => setRemoteOnly(e.target.checked)}
                />
              </label>
            </section>

            <section className="panel profile-section">
              <div className="profile-section-heading">
                <span className="onboarding-icon">
                  <Sparkles size={20} />
                </span>
                <div>
                  <h2>Предпочтения</h2>
                  <p>
                    Сохраняются как настройки профиля; доступность зависит от
                    подключённых сервисов.
                  </p>
                </div>
              </div>
              <label className="switch-row">
                <span>
                  <strong>Персональные рекомендации</strong>
                  <small>Персональные подсказки по возможностям</small>
                </span>
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                />
              </label>
              <label className="switch-row">
                <span>
                  <strong>Уведомления Telegram</strong>
                  <small>
                    Настройка предпочтения; для доставки потребуется подключить
                    Telegram
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={telegramEnabled}
                  onChange={(e) => setTelegramEnabled(e.target.checked)}
                />
              </label>
            </section>

            {error && (
              <p className="auth-message error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="auth-message success" role="status">
                {success}
              </p>
            )}
            <div className="profile-save-row">
              <span>Изменения сохраняются в твоём аккаунте Supabase.</span>
              <button
                className="auth-submit profile-save"
                type="submit"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <LoaderCircle size={17} className="spin" /> Сохраняем…
                  </>
                ) : (
                  <>
                    <Save size={17} /> Сохранить профиль
                  </>
                )}
              </button>
            </div>
          </form>
        )}
        <div style={{ marginTop: 24 }}>
          <Plans userId={userId} />
        </div>
      </section>
    </main>
  );
}
