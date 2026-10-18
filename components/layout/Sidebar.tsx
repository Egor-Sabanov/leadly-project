"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { LeadlyLogo } from "@/components/brand/LeadlyLogo";
import { mainNavigation, settingsNavigation } from "@/lib/navigation";
export function Sidebar({ activeHref = "/" }: { activeHref?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="mobile-header">
        <LeadlyLogo />
        <button
          className="icon-btn"
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={open}
          aria-controls="app-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>
      {open && (
        <button
          className="nav-backdrop"
          aria-label="Закрыть меню"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${open ? "sidebar-open" : ""}`}
        id="app-navigation"
      >
        <div className="sidebar-brand">
          <LeadlyLogo />
        </div>
        <span className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</span>
        <nav className="sidebar-nav" aria-label="Основная навигация">
          {mainNavigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href as Route}
              title={label}
              className={`nav-item ${activeHref === href ? "active" : ""}`}
              aria-current={activeHref === href ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {activeHref === href && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <nav
          className="sidebar-nav sidebar-nav-settings"
          aria-label="Личные настройки"
        >
          {settingsNavigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href as Route}
              className={`nav-item ${activeHref === href ? "active" : ""}`}
              title={label}
              onClick={() => setOpen(false)}
              aria-current={activeHref === href ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="badge">МЕНЬШЕ ШУМА. БОЛЬШЕ ДЕЙСТВИЙ.</span>
            <p>
              Твоя следующая
              <br />
              возможность — ближе.
            </p>
            <Link href="/opportunities">
              Найти своё <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="sidebar-signature">
            LEADLY <span>Сделай следующий шаг ↗</span>
          </div>
        </div>
      </aside>
    </>
  );
}
