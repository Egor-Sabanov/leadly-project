import type { DashboardStat, Opportunity } from "@/types/domain";

export const dashboardStats: DashboardStat[] = [
  { label: "Заработано", value: "42 000 ₽", detail: "+12% за неделю", tone: "positive" },
  { label: "В работе", value: "184 000 ₽", detail: "3 проекта", tone: "neutral" },
  { label: "Новые возможности", value: "23", detail: "+8 за сегодня", tone: "positive" },
  { label: "Ответов", value: "3", detail: "+1 за сегодня", tone: "positive" },
];

export const dashboardOpportunities: Opportunity[] = [
  {
    id: "opp-1",
    title: "Создание сайта для стоматологии",
    client: "Частная клиника",
    budget: "80 000 — 120 000 ₽",
    match: 97,
    money: 94,
    competition: "Низкая",
    tag: "Веб-разработка",
    source: "Telegram",
  },
  {
    id: "opp-2",
    title: "Редизайн корпоративного сайта",
    client: "Консалтинговая компания",
    budget: "100 000 — 160 000 ₽",
    match: 93,
    money: 91,
    competition: "Средняя",
    tag: "Веб-дизайн",
    source: "Открытый источник",
  },
  {
    id: "opp-3",
    title: "Landing Page для IT-сервиса",
    client: "SaaS-стартап",
    budget: "60 000 — 90 000 ₽",
    match: 89,
    money: 86,
    competition: "Низкая",
    tag: "Landing Page",
    source: "Открытый источник",
  },
];

export const dashboardFunnel = [
  ["Найдено", "23"],
  ["Сохранено", "8"],
  ["Откликнулся", "5"],
  ["Ответили", "3"],
  ["Переговоры", "2"],
  ["Заработал", "1"],
] as const;

export const dashboardSkills = ["Next.js", "React", "UI/UX", "Figma", "Landing Pages", "Telegram"] as const;

export const demoUser = {
  name: "Егор",
  role: "Веб-разработка",
  monthlyGoal: 150000,
  goalProgress: 28,
  remainingToGoal: 108000,
} as const;
