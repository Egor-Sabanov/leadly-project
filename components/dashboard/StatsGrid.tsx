import { BriefcaseBusiness, CircleDollarSign, Send, Zap } from "lucide-react";
import type { DashboardStat } from "@/types/domain";

const icons = [CircleDollarSign, BriefcaseBusiness, Zap, Send];
export function StatsGrid({ stats }: { stats: readonly DashboardStat[] }) {
  return (
    <section className="stats" aria-label="Статистика">
      {stats.map((stat, index) => {
        const Icon = icons[index];
        return (
          <article className="stat" key={stat.label}>
            <div className="stat-icon"><Icon size={18} aria-hidden="true" /></div>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small className={stat.tone === "positive" ? "positive" : ""}>{stat.detail}</small>
          </article>
        );
      })}
    </section>
  );
}
