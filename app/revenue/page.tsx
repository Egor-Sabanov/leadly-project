import { getAccount } from "@/lib/workspace";
import { Sidebar } from "@/components/layout/Sidebar";
import { SetupScreen } from "@/components/layout/SetupScreen";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryError } from "@/components/layout/QueryError";
import {
  FinanceLedger,
  type Transaction,
} from "@/components/workspace/FinanceLedger";
export const dynamic = "force-dynamic";
export default async function RevenuePage() {
  const account = await getAccount();
  if (!account) return <SetupScreen />;
  const { supabase, user } = account;
  const { data, error } = await supabase
    .from("transactions")
    .select("id,type,amount,currency_code,occurred_on,description")
    .eq("user_id", user.id)
    .order("occurred_on", { ascending: false })
    .limit(1000);
  return (
    <main className="app-shell">
      <Sidebar activeHref="/revenue" />
      <section className="content">
        <PageHeader
          eyebrow="ЯСНОСТЬ В ЦИФРАХ"
          title="Финансы"
          description="Смотри на реальный результат. Доходы и расходы — без догадок."
        />
        {error ? (
          <QueryError message={error.message} />
        ) : (
          <FinanceLedger
            items={(data || []) as Transaction[]}
            userId={user.id}
          />
        )}
        <p className="profile-muted" style={{ marginTop: 16 }}>
          Журнал показывает последние 1 000 операций.
        </p>
      </section>
    </main>
  );
}
