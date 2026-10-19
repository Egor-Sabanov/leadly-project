import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getAccount } from "@/lib/workspace";
import { Sidebar } from "@/components/layout/Sidebar";
import { SetupScreen } from "@/components/layout/SetupScreen";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryError } from "@/components/layout/QueryError";
import { Pipeline, type PipelineItem } from "@/components/workspace/Pipeline";
export const dynamic = "force-dynamic";
export default async function CrmPage() {
  const account = await getAccount();
  if (!account) return <SetupScreen />;
  const { supabase, user } = account;
  const { data, error } = await supabase
    .from("user_opportunities")
    .select(
      "opportunity_id,status,is_saved,notes,opportunities(title,company_name,type)",
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(500);
  return (
    <main className="app-shell">
      <Sidebar activeHref="/crm" />
      <section className="content">
        <PageHeader
          eyebrow="РАБОТА ПО ЭТАПАМ"
          title="Мои проекты"
          description="Сохранённые задания, отклики и переговоры — по этапам работы."
          action={
            <Link className="ghost" href="/opportunities">
              Добавить из ленты <ArrowUpRight size={15} />
            </Link>
          }
        />
        {error ? (
          <QueryError message={error.message} />
        ) : (
          <Pipeline items={(data || []) as unknown as PipelineItem[]} />
        )}

      </section>
    </main>
  );
}
