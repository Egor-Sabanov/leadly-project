import { PencilLine } from "lucide-react";
import { dashboardSkills } from "@/lib/dashboard-data";

export function ProfilePanel() {
  return (
    <section className="panel">
      <div className="panel-title"><div><div className="eyebrow">ПРОФИЛЬ</div><h2>Твоя сила</h2></div><PencilLine size={18} aria-hidden="true" /></div>
      <div className="skills">
        {dashboardSkills.map((skill) => <span key={skill}>{skill}</span>)}
      </div>
      <div className="fit">
        <strong>92%</strong>
        <div><span>Профиль заполнен</span><small>LEADLY лучше понимает, какие возможности тебе показывать.</small></div>
      </div>
    </section>
  );
}
