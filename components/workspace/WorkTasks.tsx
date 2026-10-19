import { getAccount } from "@/lib/workspace";
import { TasksBoard } from "./TasksBoard";
import { QueryError } from "@/components/layout/QueryError";
import { taskColumns, TASK_LIMIT, type WorkTask } from "@/lib/tasks";

export async function WorkTasks({ compact = false }: { compact?: boolean }) {
  const account = await getAccount();
  if (!account)
    return (
      <p className="auth-message">Войди в аккаунт, чтобы сохранять дела.</p>
    );
  const { supabase, user } = account;
  const [tasks, clients, profile] = await Promise.all([
    supabase
      .from("follow_ups")
      .select(taskColumns)
      .eq("user_id", user.id)
      .order("completed_at", { nullsFirst: true })
      .order("scheduled_for")
      .limit(TASK_LIMIT),
    supabase
      .from("clients")
      .select("id,name")
      .eq("user_id", user.id)
      .order("name")
      .limit(200),
    supabase
      .from("profiles")
      .select("timezone")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  if (tasks.error || clients.error)
    return (
      <QueryError message="Не удалось загрузить твой список дел. Обнови страницу." />
    );
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: profile.data?.timezone || "Europe/Moscow",
  });
  return (
    <TasksBoard
      initialTasks={tasks.data as unknown as WorkTask[]}
      clients={clients.data || []}
      today={today}
      compact={compact}
    />
  );
}
