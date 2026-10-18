import {
  BarChart3,
  BriefcaseBusiness,
  LayoutDashboard,
  Search,
  Settings,
  Sparkles,
  Send,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const mainNavigation: NavItem[] = [
  { label: "Главная", href: "/", icon: LayoutDashboard },
  { label: "Возможности", href: "/opportunities", icon: Search },
  { label: "Клиенты", href: "/clients", icon: Users },
  { label: "CRM", href: "/crm", icon: BriefcaseBusiness },
  { label: "Аналитика", href: "/analytics", icon: BarChart3 },
  { label: "Доход", href: "/revenue", icon: WalletCards },
  { label: "AI-профиль", href: "/profile", icon: Sparkles },
  { label: "AI-отклики", href: "/ai-outreach", icon: Send },
];

export const settingsNavigation: NavItem[] = [
  { label: "Настройки", href: "/settings", icon: Settings },
];
