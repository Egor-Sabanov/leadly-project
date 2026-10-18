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
import { disciplines } from "@/lib/disciplines";
const specializations = disciplines;
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
  ...[
    [
      "SMM: ведение Telegram-канала компании",
      "Нужен SMM-специалист: контент-план, публикации и отчёт по соцсетям. Настроить регулярную работу с аудиторией.",
    ],
    [
      "Озвучка и обработка подкаста",
      "Ищем диктора: озвучка, сведение и обработка звука. Нужен чистый звук для серии подкастов.",
    ],
    [
      "Перевод и локализация текстов на русский",
      "Нужен переводчик: подготовить перевод текстов и локализацию интерфейса. Тематика и объём обсуждаются с заказчиком.",
    ],
    [
      "Оформление карточек товаров для Ozon",
      "Ищем специалиста по маркетплейсам: создать карточки товаров, подготовить инфографику для Ozon и Wildberries.",
    ],
    [
      "Аналитика продаж и дашборд в Power BI",
      "Нужен аналитик данных: проверить таблицы Excel, подготовить SQL-запросы и собрать дашборд в Power BI.",
    ],
    [
      "Удалённый бизнес-ассистент для команды",
      "Нужен бизнес-ассистент: работа с документами, поиск информации и организация задач руководителя.",
    ],
    [
      "Подготовка образовательных материалов курса",
      "Ищем методиста онлайн-обучения: разработка курсов, учебные материалы и проверка заданий для учеников.",
    ],
  ].map(([title, description]) => ({
    title,
    description,
    category: null,
    type: "project",
    budget_min: null,
    budget_max: null,
  })),
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
            skillNames: [...specializations[profile].skills],
            serviceNames: [...specializations[profile].services],
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
