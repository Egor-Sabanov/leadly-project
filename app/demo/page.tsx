"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  OpportunityFeed,
  type OpportunityItem,
} from "@/components/opportunities/OpportunityFeed";
import { scoreOpportunity } from "@/lib/opportunity-scoring";
const specializations = [
  {
    label: "Дизайн",
    headline: "UI/UX-дизайнер",
    skills: ["Figma", "UI/UX-дизайн"],
    services: ["Прототип и дизайн в Figma"],
  },
  {
    label: "Разработка",
    headline: "Разработка веб-приложений",
    skills: ["React", "TypeScript", "Next.js"],
    services: ["Создание лендинга"],
  },
  {
    label: "Контент",
    headline: "Копирайтинг и контент",
    skills: ["Копирайтинг", "SEO"],
    services: ["Написание текстов для сайта"],
  },
  {
    label: "Маркетинг",
    headline: "Маркетинг и продвижение",
    skills: ["SEO", "Аналитика"],
    services: ["SEO-аудит сайта"],
  },
  {
    label: "Видео",
    headline: "Видеомонтаж",
    skills: ["Монтаж Reels и Shorts"],
    services: ["Монтаж Reels и Shorts"],
  },
];
const samples = [
  {
    title: "Дизайн интерфейса сервиса для небольших команд",
    description:
      "Нужен UI/UX-дизайнер: продумать сценарии, собрать прототип в Figma и подготовить адаптивный дизайн личного кабинета. Стиль — простой и функциональный.",
    category: "Дизайн",
    type: "project",
    budget_min: 45000,
    budget_max: 70000,
  },
  {
    title: "React / Next.js: лендинг для образовательного проекта",
    description:
      "Разработать адаптивный лендинг на Next.js и TypeScript. Дизайн и тексты готовы. Нужны аккуратная вёрстка, формы и базовая оптимизация.",
    category: "Разработка",
    type: "project",
    budget_min: 60000,
    budget_max: 85000,
  },
  {
    title: "Копирайтер: тексты для сайта и истории клиентов",
    description:
      "Ищем автора, который умеет объяснять сложное простыми словами. Нужны структура страниц, SEO-тексты и редактура. Покажите примеры работ.",
    category: "Контент",
    type: "project",
    budget_min: 15000,
    budget_max: 25000,
  },
  {
    title: "SEO-аудит сайта и план продвижения",
    description:
      "Нужен SEO-специалист: технический аудит, семантика, аналитика и список приоритетных улучшений. Результат — понятный план действий.",
    category: "Маркетинг",
    type: "project",
    budget_min: 20000,
    budget_max: 35000,
  },
  {
    title: "Монтаж Reels и Shorts для образовательного бренда",
    description:
      "Серия коротких видео из готовых материалов: монтаж, субтитры, работа со звуком. Нужны чувство ритма и аккуратная визуальная подача.",
    category: "Видео",
    type: "project",
    budget_min: 18000,
    budget_max: 30000,
  },
];
export default function DemoPage() {
  const [profile, setProfile] = useState(0);
  const items = useMemo(
    () =>
      samples.map((s, i) => {
        const base = {
          ...s,
          id: `demo-${i}`,
          company_name: "Пример · не реальное объявление",
          source_url: "https://example.com",
          location: null,
          remote: true,
          currency_code: "RUB",
          competition: "unknown",
          published_at: "2026-10-18T09:00:00Z",
          discovered_at: "2026-10-18T09:00:00Z",
        };
        const result = scoreOpportunity(
          {
            headline: specializations[profile].headline,
            skillNames: specializations[profile].skills,
            serviceNames: specializations[profile].services,
            currencyCode: "RUB",
            targetMonthlyIncome: 100000,
            preferredTypes: ["project"],
          },
          {
            ...base,
            budget_extraction: "heuristic",
            budget_confidence: "low",
            currency_evidence: "explicit",
          },
        );
        return {
          ...base,
          status: "new",
          is_saved: false,
          match_score: result.match_score,
          fit_score: result.fit_score,
          money_score: result.money_score,
          money_score_status: result.explanation.money_score_status,
          competition_score: result.competition_score,
          matched_keywords: result.explanation.matched_keywords,
          score_reasons: result.explanation.reasons,
          score_cautions: result.explanation.cautions,
        } as OpportunityItem;
      }),
    [profile],
  );
  return (
    <main className="app-shell">
      <Sidebar activeHref="/opportunities" />
      <section className="content">
        <PageHeader
          eyebrow="ПОСМОТРИ, КАК ЭТО РАБОТАЕТ"
          title="Твой фокус. Твои возможности."
          description="Выбери специализацию и посмотри, как меняется персональная оценка."
          action={
            <Link href="/auth" className="ghost">
              Создать аккаунт <ArrowUpRight size={15} />
            </Link>
          }
        />
        <div className="demo-banner">
          <p>
            <strong>Демонстрационное пространство.</strong>
            <br />
            <span>
              Примеры вымышлены. Изменения действуют до обновления страницы и не
              записываются в базу.
            </span>
          </p>
          <span className="badge">БЕЗ РЕГИСТРАЦИИ</span>
        </div>
        <div className="welcome-hero">
          <span className="badge">ДЛЯ DIGITAL-СПЕЦИАЛИСТОВ</span>
          <h2>
            Твоя экспертиза.
            <br />
            Новые перспективы.
          </h2>
          <p>
            Одна лента — разные точки приложения твоих навыков. LEADLY объясняет
            совпадения, чтобы ты мог выбрать осознанно.
          </p>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 25 }}
          >
            {specializations.map((s, i) => (
              <button
                key={s.label}
                className={i === profile ? "primary" : "ghost"}
                aria-pressed={i === profile}
                onClick={() => setProfile(i)}
              >
                {s.label}
                {i === profile && <ArrowRight size={14} />}
              </button>
            ))}
          </div>
        </div>
        <OpportunityFeed opportunities={items} demo />
        <footer className="footer-note">
          <span>LEADLY · Демонстрация интерфейса</span>
          <Link href="/auth">Перейти к своему пространству ↗</Link>
        </footer>
      </section>
    </main>
  );
}
