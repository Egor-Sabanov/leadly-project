import {
  ListTodo,
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
  { label: "Главная", href: "/", icon: LayoutDashboard },
  { label: "Найти задания", href: "/opportunities", icon: Search },
  { label: "Мои проекты", href: "/crm", icon: BriefcaseBusiness },
  { label: "Отклики", href: "/ai-outreach", icon: Send },
  { label: "Клиенты", href: "/clients", icon: Users },
  { label: "Мои задачи", href: "/tasks", icon: ListTodo },
  { label: "Аналитика", href: "/analytics", icon: BarChart3 },
  { label: "Финансы", href: "/revenue", icon: WalletCards },
];
export const settingsNavigation: NavItem[] = [
  { label: "Мой профиль", href: "/profile", icon: UserRound },
  { label: "Настройки", href: "/settings", icon: Settings },
];
