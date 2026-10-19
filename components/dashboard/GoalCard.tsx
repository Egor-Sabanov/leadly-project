import { ArrowUpRight, PencilLine } from "lucide-react";

type GoalCardProps = { goal: number; progress: number; remaining: number };

export function GoalCard({ goal, progress, remaining }: GoalCardProps) {
  return (
    <section className="goal-card" aria-label="Цель дохода">
      <div>
        <span className="label">Твоя цель</span>
        <div className="goal-row"><strong>{goal.toLocaleString("ru-RU")} ₽</strong><span>{progress}% выполнено</span></div>
        <div className="progress" aria-label={`Прогресс ${progress}%`}><i style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="goal-action">
        <PencilLine size={20} aria-hidden="true" />
        <span>План дохода</span>
        <small>Ещё {remaining.toLocaleString("ru-RU")} ₽ до цели</small>
        <button type="button">Посмотреть план <ArrowUpRight size={15} aria-hidden="true" /></button>
      </div>
    </section>
  );
}
