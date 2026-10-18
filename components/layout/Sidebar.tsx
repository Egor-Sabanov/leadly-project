"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Menu, X } from "lucide-react";
import { LeadlyLogo } from "@/components/brand/LeadlyLogo";
import { mainNavigation, settingsNavigation } from "@/lib/navigation";
export function Sidebar({ activeHref = "/" }: { activeHref?: string }) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const trigger = menuButton.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document
      .getElementById("app-navigation")
      ?.querySelector<HTMLAnchorElement>("a")
      ?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", escape);
      trigger?.focus();
    };
  }, [open]);
  return (
    <>
      <header className="mobile-header">
        <LeadlyLogo />
        <button
          ref={menuButton}
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
          <div className="sidebar-signature">
            LEADLY <span>Твоё рабочее пространство</span>
          </div>
        </div>
      </aside>
    </>
  );
}
