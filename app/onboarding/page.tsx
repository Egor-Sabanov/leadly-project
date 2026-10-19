"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Target,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { LeadlyLogo } from "@/components/brand/LeadlyLogo";

import { DisciplinePreset } from "@/components/profile/DisciplinePreset";
import { mergeProfileSkills } from "@/lib/disciplines";

type Profile = {
  id: string;
  display_name: string | null;
  headline: string | null;
  target_monthly_income: number | null;
  onboarding_completed: boolean;
};

const workTypes = [
  { value: "freelance", label: "Фриланс", note: "Заказы и клиенты" },
  { value: "project", label: "Проекты", note: "Разовые задачи" },
  { value: "client", label: "Поиск клиентов", note: "Прямые продажи услуг" },
  { value: "job", label: "Работа", note: "Вакансии и подработки" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [income, setIncome] = useState("100000");
  const [skills, setSkills] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    "freelance",
    "project",
    "client",
  ]);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
          error: sessionError,
        } = await supabase.auth.getUser();
        if (sessionError) throw sessionError;
        if (!user) {
          router.replace("/auth");
          return;
        }
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select(
            "id,display_name,headline,target_monthly_income,onboarding_completed",
          )
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!active) return;
        setUserId(user.id);
        setName(
          data?.display_name ||
            String(
              user.user_metadata?.display_name ||
                user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                "",
            ),
        );
        setHeadline(data?.headline || "");
        setIncome(
          data?.target_monthly_income == null
            ? "100000"
            : String(data.target_monthly_income),
        );
        if (data?.onboarding_completed) router.replace("/");
      } catch (caught) {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Не удалось загрузить профиль.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [router]);

  function toggleType(value: string) {
    setSelectedTypes((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!userId) {
      setError("Сессия не найдена. Войди в аккаунт ещё раз.");
      return;
    }
    if (selectedTypes.length === 0) {
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
        p_skills: skills.trim(),
        p_income: target,
        p_currency: "RUB",
        p_types: selectedTypes,
        p_remote: remoteOnly,
        p_ai: true,
        p_telegram: false,
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (saveError) throw saveError;
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось сохранить настройки. Попробуй ещё раз.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header">
        <LeadlyLogo />
      </header>
      {loading ? (
        <div className="onboarding-loading">
          <LoaderCircle className="spin" size={24} /> Загружаем твой профиль…
        </div>
      ) : (
        <section className="onboarding-card">
          <div className="onboarding-icon">
            <Target size={23} />
          </div>
          <div className="auth-kicker">НАСТРОЙКА LEADLY</div>
          <h1>Давай настроим поиск под тебя</h1>
          <p className="auth-subtitle">
            Эти данные помогут в дальнейшем ранжировать возможности под твои
            навыки и финансовую цель.
          </p>
          <form className="onboarding-form" onSubmit={handleSubmit}>
            <div className="onboarding-section-title">
              <UserRound size={17} />
              <span>О тебе</span>
            </div>
            <label>
              Имя
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Как к тебе обращаться"
                required
              />
            </label>
            <DisciplinePreset
              onApply={(title, added) => {
                setHeadline(title);
                setSkills((current) => mergeProfileSkills(current, added));
              }}
            />
            <label>
              Чем ты занимаешься?
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={140}
                placeholder="Например, создаю бренды, пишу тексты или разрабатываю сайты"
              />
            </label>
            <label>
              Навыки и инструменты
              <input
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                maxLength={1000}
                placeholder="Например, Figma, аналитика, SEO, React"
              />
            </label>
            <div className="onboarding-section-title">
              <Target size={17} />
              <span>Цели и предпочтения</span>
            </div>
            <label>
              Желаемый доход в месяц, ₽
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
            <fieldset className="work-types">
              <legend>Какие возможности искать?</legend>
              <div className="work-type-grid">
                {workTypes.map((type) => (
                  <label
                    key={type.value}
                    className={`work-type ${selectedTypes.includes(type.value) ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(type.value)}
                      onChange={() => toggleType(type.value)}
                    />
                    <span>
                      <strong>{type.label}</strong>
                      <small>{type.note}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="switch-row">
              <span>
                <strong>Предпочитаю удалённую работу</strong>
                <small>
                  Учитывать при подборе. Точный формат можно выбрать в фильтрах заданий.
                </small>
              </span>
              <input
                type="checkbox"
                checked={remoteOnly}
                onChange={(e) => setRemoteOnly(e.target.checked)}
              />
            </label>
            {error && (
              <p className="auth-message error" role="alert">
                {error}
              </p>
            )}
            <button className="auth-submit" type="submit" disabled={saving}>
              {saving ? (
                <>
                  <LoaderCircle size={18} className="spin" /> Сохраняем профиль…
                </>
              ) : (
                <>
                  Сохранить и продолжить <ArrowRight size={17} />
                </>
              )}
            </button>
            <Link href="/opportunities" className="onboarding-back">Сначала посмотреть все задания <ArrowRight size={14} /></Link>
            <Link href="/auth" className="onboarding-back">
              <ArrowLeft size={14} /> Выйти и вернуться к авторизации
            </Link>
          </form>
        </section>
      )}
    </main>
  );
}
