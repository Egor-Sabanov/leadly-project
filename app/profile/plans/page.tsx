import { Sidebar } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Plans } from "@/components/profile/Plans";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { getAccount } from "@/lib/workspace";
export const dynamic = "force-dynamic";
export default async function ProfilePlans() {
  const account = await getAccount();
  const profile = account
    ? await account.supabase
        .from("profiles")
        .select("requested_plan")
        .eq("id", account.user.id)
        .maybeSingle()
    : null;
  return (
    <main className="app-shell">
      <Sidebar activeHref="/profile" />
      <section className="content">
        <PageHeader
          eyebrow="МОЙ ПРОФИЛЬ"
          title="Тарифы"
          description="Выбери возможности для своего следующего этапа."
        />
        <ProfileTabs plans />
        <Plans
          userId={account?.user.id || ""}
          requestedPlan={profile?.data?.requested_plan || ""}
        />
      </section>
    </main>
  );
}
