import Link from "next/link";
import type { Route } from "next";
import { Target } from "lucide-react";
import { LeadlyLogo } from "@/components/brand/LeadlyLogo";
import { mainNavigation, settingsNavigation } from "@/lib/navigation";

type SidebarProps = { activeHref?: string };

export function Sidebar({ activeHref = "/" }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <LeadlyLogo />
      </div>

      <nav className="sidebar-nav" aria-label="Основная навигация">
        {mainNavigation.map((item) => {
          const Icon = item.icon;
          const active = item.href === activeHref;
          return (
            <Link className={`nav-item ${active ? "active" : ""}`} href={item.href as Route} key={item.href} aria-current={active ? "page" : undefined}>
              <Icon size={17} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <nav className="sidebar-nav sidebar-nav-settings" aria-label="Настройки">
        {settingsNavigation.map((item) => {
          const Icon = item.icon;
          const active = item.href === activeHref;
          return (
            <Link className={`nav-item ${active ? "active" : ""}`} href={item.href as Route} key={item.href} aria-current={active ? "page" : undefined}>
              <Icon size={17} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="goal-mini">
          <Target size={16} aria-hidden="true" />
          <div>
            <span>Цель месяца</span>
            <strong>150 000 ₽</strong>
          </div>
        </div>
        <div className="profile-mini">
          <div className="avatar" aria-hidden="true">Е</div>
          <div>
            <strong>Егор</strong>
            <span>Веб-разработка</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
