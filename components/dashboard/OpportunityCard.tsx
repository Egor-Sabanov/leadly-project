import { ArrowUpRight } from "lucide-react";
import type { Opportunity } from "@/types/domain";
import { Score } from "@/components/dashboard/Score";

type OpportunityCardProps = { opportunity: Opportunity };

export function OpportunityCard({ opportunity }: OpportunityCardProps) {
  return (
    <article className="opportunity">
      <div className="opp-top">
        <span className="source"><span className="source-dot" /> {opportunity.source}</span>
        <span className="tag">{opportunity.tag}</span>
      </div>
      <h3>{opportunity.title}</h3>
      <p className="client">{opportunity.client}</p>
      <div className="budget">{opportunity.budget}</div>
      <div className="scores">
        <Score label="Match" value={opportunity.match} />
        <Score label="Money" value={opportunity.money} />
        <div className="score">
          <span>Конкуренция</span>
          <strong>{opportunity.competition}</strong>
        </div>
      </div>
      <div className="opp-footer">
        <button className="primary" type="button">Откликнуться</button>
        <button className="secondary" type="button">Подробнее <ArrowUpRight size={13} aria-hidden="true" /></button>
      </div>
    </article>
  );
}
