import type { SupabaseClient } from "@supabase/supabase-js";
import { validUuid } from "./request-guards";
import { loadRussianOpportunities } from "./russian-opportunities";
import { opportunityDisciplines } from "./disciplines";
import { matchesProfileSelection, profileOpportunitySelection } from "./opportunity-filters";
import { scoreOpportunity } from "./opportunity-scoring";

export type WorkspaceCommand = "opportunities" | "saved" | "projects" | "tasks" | "today";
const clean = (value: unknown, max = 140) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
export function telegramCalendarDate(timezone: unknown, now = new Date()) {
  try { return new Intl.DateTimeFormat("sv-SE", { timeZone: typeof timezone === "string" ? timezone : "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
  catch { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
}
export async function telegramWorkspace(command: WorkspaceCommand, db: SupabaseClient, telegramId: number, now = new Date()): Promise<string> {
  const mapping = await db.from("telegram_accounts").select("user_id,chat_id").eq("telegram_user_id", telegramId).maybeSingle();
  if (mapping.error) throw new Error("Storage unavailable");
  if (!mapping.data) return "🔗 Подключи свой аккаунт: открой LEADLY на сайте → Профиль → Telegram. После подтверждения здесь появятся твои задания, сохранённое, проекты и дела.";
  if (mapping.data.chat_id !== telegramId || !validUuid(mapping.data.user_id)) throw new Error("Invalid mapping");
  const id = mapping.data.user_id;
  const account = await db.auth.admin.getUserById(id);
  const user = account.data?.user;
  const banned = (user as unknown as { banned_until?: string } | undefined)?.banned_until;
  if (account.error || !user || user.id !== id || !user.email_confirmed_at || user.is_anonymous || (banned && Date.parse(banned) > now.getTime())) return "🔒 Вход в связанный аккаунт недоступен. Открой сайт LEADLY и проверь доступ к своему кабинету.";
  const profile = await db.from("profiles").select("headline,skills_summary,onboarding_completed,timezone").eq("id", id).maybeSingle();
  if (profile.error) throw new Error("Storage unavailable");
  if (command === "tasks" || command === "today") {
    let query = db.from("follow_ups").select("note,scheduled_for").eq("user_id", id).is("completed_at", null);
    const today = telegramCalendarDate(profile.data?.timezone, now);
    // Tasks are calendar dates stored at noon UTC. Compare their date, not the
    // server's clock; a user's timezone determines which day is 'today'.
    if (command === "today") query = query.lt("scheduled_for", today + "T23:59:59.999Z");
    const result = await query.order("scheduled_for").limit(6);
    if (result.error) throw new Error("Storage unavailable");
    const rows = result.data || [];
    if (!rows.length) return command === "today" ? "📅 На сегодня и за прошлые дни незавершённых дел нет. Новое дело можно добавить в приложении." : "✅ Открытых дел пока нет. Добавь в приложении следующий шаг: подготовить отклик, написать клиенту или сдать проект.";
    return (command === "today" ? "📅 Дела на сегодня и просроченные" : "✅ Ближайшие дела") + "\n\n" + rows.slice(0, 5).map(row => {
      const date = String(row.scheduled_for).slice(0, 10);
      return `• ${clean(row.note) || "Связаться с клиентом"} — ${date}${date < today ? " · просрочено" : ""}`;
    }).join("\n") + (rows.length > 5 ? "\n\nОстальные дела — в приложении." : "\n\nОтметить выполненное или изменить дату можно в приложении.");
  }
  if (command === "saved" || command === "projects") {
    let query = db.from("user_opportunities").select("status,opportunities(id,title)").eq("user_id", id);
    query = command === "saved" ? query.eq("is_saved", true) : query.in("status", ["applied", "replied", "negotiating", "won"]);
    const result = await query.order("updated_at", { ascending: false }).limit(6);
    if (result.error) throw new Error("Storage unavailable");
    const rows = (result.data || []) as unknown as { status: string; opportunities: { id: string; title: string } | null }[];
    const labels: Record<string, string> = { applied: "Отклик отправлен", replied: "Получен ответ", negotiating: "Переговоры", won: "Успех" };
    const valid = rows.filter(row => row.opportunities && validUuid(row.opportunities.id));
    if (!valid.length) return command === "saved" ? "📌 Сохранённых заданий пока нет. Отметь интересное задание в LEADLY — оно появится здесь." : "💼 Проектов и откликов пока нет. Выбери задание в приложении и сохрани следующий шаг.";
    return (command === "saved" ? "📌 Твои сохранённые задания" : "💼 Твои проекты и отклики") + "\n\n" + valid.slice(0, 5).map(row => `• ${clean(row.opportunities!.title)}${command === "projects" ? " — " + labels[row.status] : ""}`).join("\n") + "\n\nКарточки, заметки и статусы — в приложении.";
  }
  const { rows, selection } = await telegramOpportunityRows(db, id, profile.data);
  if (!rows.length) return selection.configured ? "🔎 Сейчас нет заданий по твоему профилю. В приложении можно открыть «Все задания» или уточнить навыки." : "🔎 Сейчас нет доступных заданий. Попробуй открыть ленту позже.";
  return (selection.configured ? "🔎 Задания по твоему профилю" : "🔎 Задания из общей ленты") + "\n\n" + rows.slice(0, 5).map(row => "• " + clean(row.title)).join("\n") + "\n\nУсловия и актуальность проверь в карточке и первоисточнике. Полная лента — в приложении.";
}


export type TelegramProfile = { headline?: string | null; skills_summary?: string | null; onboarding_completed?: boolean | null; timezone?: string | null };
export async function telegramOpportunityRows(db: SupabaseClient, id: string, profile: TelegramProfile | null) {
  const [feed, preferences, skillRows, serviceRows] = await Promise.all([
    loadRussianOpportunities(db, "all"),
    db.from("user_preferences").select("preferred_opportunity_types").eq("user_id", id).maybeSingle(),
    db.from("profile_skills").select("skills(name)").eq("user_id", id),
    db.from("profile_services").select("services(name)").eq("user_id", id),
  ]);
  if (feed.error || preferences.error || skillRows.error || serviceRows.error) throw new Error("Storage unavailable");
  const skills = (skillRows.data || []) as unknown as { skills: { name: string } | null }[];
  const services = (serviceRows.data || []) as unknown as { services: { name: string } | null }[];
  const skillNames = [...skills.map(row => row.skills?.name || ""), ...(profile?.skills_summary || "").split(/[,;\n]+/)].map(v => v.trim()).filter(Boolean);
  const serviceNames = services.map(row => row.services?.name || "").filter(Boolean);
  const selection = profileOpportunitySelection({ completed: profile?.onboarding_completed, headline: profile?.headline, skills: skillNames, services: serviceNames, types: preferences.data?.preferred_opportunity_types });
  const rows = feed.data.filter(item => {
    const score = scoreOpportunity({ headline: profile?.headline, skillNames, serviceNames }, item);
    return matchesProfileSelection({ type: item.type, matched_keywords: score.explanation.matched_keywords }, opportunityDisciplines(item), selection);
  });
  return { rows, selection };
}
