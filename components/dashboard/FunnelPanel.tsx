import { dashboardFunnel } from "@/lib/dashboard-data";

export function FunnelPanel() {
  return (
    <section className="panel">
      <div className="panel-title"><div><div className="eyebrow">ВОРОНКА</div><h2>Твои возможности</h2></div><span>184 000 ₽</span></div>
      <div className="funnel">
        {dashboardFunnel.map(([label, value], index) => (
          <div className="funnel-step" key={label}>
            <span>{label}</span><strong>{value}</strong><i style={{ width: `${100 - index * 13}%` }} />
          </div>
        ))}
      </div>
    </section>
  );
}
