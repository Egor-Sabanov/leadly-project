export type OpportunityCompetition = "Низкая" | "Средняя" | "Высокая" | "Неизвестно";

export type Opportunity = {
  id: string;
  title: string;
  client: string;
  budget: string;
  match: number;
  money: number;
  competition: OpportunityCompetition;
  tag: string;
  source: string;
};

export type DashboardStat = {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "neutral" | "negative";
};
