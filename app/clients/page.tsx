import { getAccount } from "@/lib/workspace";
import { Sidebar } from "@/components/layout/Sidebar";
import { SetupScreen } from "@/components/layout/SetupScreen";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryError } from "@/components/layout/QueryError";
import {
  ClientBook,
  type ClientRecord,
} from "@/components/workspace/ClientBook";
export const dynamic = "force-dynamic";
export default async function ClientsPage() {
  const account = await getAccount();
  if (!account) return <SetupScreen />;
  const { supabase, user } = account;
  const { data, error } = await supabase
    .from("clients")
    .select("id,name,status,source,notes,estimated_value,currency_code")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(500);
  return (
    <main className="app-shell">
      <Sidebar activeHref="/clients" />
      <section className="content">
        <PageHeader
          eyebrow="ЛЮДИ И ВОЗМОЖНОСТИ"
          title="Клиенты"
          description="Хорошая работа начинается с разговора. Сохраняй контакты и контекст."
        />
        {error ? (
          <QueryError message={error.message} />
        ) : (
          <ClientBook items={(data || []) as ClientRecord[]} userId={user.id} />
        )}
        <p className="profile-muted" style={{ marginTop: 16 }}>
          Последние 500 контактов. Автоматического поиска контактов или рассылок
          нет.
        </p>
      </section>
    </main>
  );
}
