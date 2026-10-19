import { ArrowUpRight, Check, PencilLine } from "lucide-react";

export function AiRecommendation() {
  return (
    <aside className="ai-card">
      <div className="ai-head">
        <div className="ai-orb"><PencilLine size={20} aria-hidden="true" /></div>
        <div><span className="eyebrow">LEADLY</span><h3>Что сделать сейчас?</h3></div>
      </div>
      <p>У тебя есть возможность с высокой вероятностью ответа. Она хорошо совпадает с твоим опытом и портфолио.</p>
      <div className="recommend">
        <div><span>Рекомендуем №1</span><strong>Сайт для стоматологии</strong><small>Match 97% · Money 94%</small></div>
        <Check size={18} aria-hidden="true" />
      </div>
      <button className="primary full" type="button">Начать работу <ArrowUpRight size={16} aria-hidden="true" /></button>
    </aside>
  );
}
