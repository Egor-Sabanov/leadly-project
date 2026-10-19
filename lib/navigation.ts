import {
  BarChart3,
  BriefcaseBusiness,
  LayoutDashboard,
  Search,
  Settings,
  Send,
  Users,
  WalletCards,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
export type NavItem = { label: string; href: string; icon: LucideIcon };
export const mainNavigation: NavItem[] = [
  { label: "Обзор", href: "/", icon: LayoutDashboard },
  { label: "Возможности", href: "/opportunities", icon: Search },
  { label: "Моя воронка", href: "/crm", icon: BriefcaseBusiness },
  { label: "Отклики", href: "/ai-outreach", icon: Send },
  { label: "Клиенты", href: "/clients", icon: Users },
  { label: "Аналитика", href: "/analytics", icon: BarChart3 },
  { label: "Финансы", href: "/revenue", icon: WalletCards },
];
export const settingsNavigation: NavItem[] = [
  { label: "Мой профиль", href: "/profile", icon: UserRound },
  { label: "Настройки", href: "/settings", icon: Settings },
];
