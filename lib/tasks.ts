export type WorkTask = {
  id: string;
  note: string | null;
  scheduled_for: string;
  completed_at: string | null;
  client_id: string | null;
  clients: { name: string } | null;
};
export type TaskClient = { id: string; name: string };
export const TASK_LIMIT = 200;
export const taskColumns =
  "id,note,scheduled_for,completed_at,client_id,clients(name)";

/** Treat deadlines as calendar dates, independent of the device's timezone. */
export function validTaskDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T12:00:00.000Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function taskDateLabel(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
export function taskName(task: WorkTask) {
  return task.note?.trim() || "Связаться с клиентом";
}
