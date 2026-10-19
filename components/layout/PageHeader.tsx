import type { ReactNode } from "react";

export function PageHeader({
  eyebrow = "РАБОЧЕЕ ПРОСТРАНСТВО",
  title,
  description,
  action,
  avatar,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
  avatar?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <div className="page-heading-line">
          {avatar}
          <h1>{title}</h1>
        </div>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
