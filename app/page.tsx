import { ArrowUpRight, Send } from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { AiRecommendation } from "@/components/dashboard/AiRecommendation";
import { FunnelPanel } from "@/components/dashboard/FunnelPanel";
import { GoalCard } from "@/components/dashboard/GoalCard";
import { OpportunityCard } from "@/components/dashboard/OpportunityCard";
import { ProfilePanel } from "@/components/dashboard/ProfilePanel";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { dashboardOpportunities, dashboardStats, demoUser } from "@/lib/dashboard-data";

export default async function Home() {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect("/auth");
  }
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
  if (authError || !authUser) redirect("/auth");
  const { data: profile } = await supabase.from("profiles").select("display_name, headline, target_monthly_income, onboarding_completed").eq("id", authUser.id).maybeSingle();
  if (!profile?.onboarding_completed) redirect("/onboarding");
  const user = {
    ...demoUser,
    name: profile.display_name || authUser.email?.split("@")[0] || "друг",
    role: profile.headline || demoUser.role,
    monthlyGoal: Number(profile.target_monthly_income ?? demoUser.monthlyGoal),
  };
  const stats = dashboardStats;
  const opportunities = dashboardOpportunities;

  return (
    <main className="app-shell">
      <Sidebar activeHref="/" />
      <section className="content">
        <header className="topbar">
          <div>
            <div className="eyebrow">СРЕДА, 7 ОКТЯБРЯ</div>
            <h1>Привет, {user.name} 👋</h1>
            <p>Вот что LEADLY нашёл для тебя сегодня.</p>
          </div>
          <div className="topbar-actions"><span className="signed-in-email">{authUser.email}</span><button className="icon-btn" type="button" aria-label="Уведомления"><Send size={18} aria-hidden="true" /></button><SignOutButton /></div>
        </header>

        <GoalCard goal={user.monthlyGoal} progress={user.goalProgress} remaining={user.remainingToGoal} />
        <StatsGrid stats={stats} />

        <div className="section-heading">
          <div><div className="eyebrow">AI-РАДАР</div><h2>Лучшие возможности для тебя</h2><p>LEADLY уже отфильтровал шум и оставил то, на что стоит потратить время.</p></div>
          <button className="ghost" type="button">Все возможности <ArrowUpRight size={15} aria-hidden="true" /></button>
        </div>

        <section className="main-grid">
          <div className="opportunity-list">
            {opportunities.map((opportunity) => <OpportunityCard opportunity={opportunity} key={opportunity.id} />)}
          </div>
          <AiRecommendation />
        </section>

        <section className="lower-grid">
          <FunnelPanel />
          <ProfilePanel />
        </section>
      </section>
    </main>
  );
}
