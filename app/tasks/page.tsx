import { getAccount } from "@/lib/workspace";
import { SetupScreen } from "@/components/layout/SetupScreen";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkTasks } from "@/components/workspace/WorkTasks";
export const dynamic = "force-dynamic";
export default async function TasksPage() {
  if (!(await getAccount())) return <SetupScreen />;
  return (
    <main className="app-shell">
      <Sidebar activeHref="/tasks" />
      <section className="content">
        <PageHeader
          eyebrow="ОТ ПЛАНА К ДЕЙСТВИЮ"
          title="Мои задачи"
          description="Личные дела по поиску заказов, общению с клиентами и работе над проектами."
        />
        <WorkTasks />
      </section>
    </main>
  );
}
