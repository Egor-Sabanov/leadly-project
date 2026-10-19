import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { accountApi } from "@/lib/account-api";
import { readLimitedJson, isRecord, validUuid } from "@/lib/request-guards";
import { TASK_LIMIT, taskColumns, validTaskDate } from "@/lib/tasks";

export async function GET(request: Request) {
  const access = await accountApi(request);
  if (access.error) return access.error;
  const { supabase, user } = access.account!;
  const { data, error } = await supabase
    .from("follow_ups")
    .select(taskColumns)
    .eq("user_id", user.id)
    .order("completed_at", { nullsFirst: true })
    .order("scheduled_for")
    .limit(TASK_LIMIT);
  return error
    ? NextResponse.json(
        { error: "Не удалось загрузить дела." },
        { status: 503 },
      )
    : NextResponse.json(
        { tasks: data },
        { headers: { "Cache-Control": "private, no-store" } },
      );
}

async function mutate(
  request: Request,
  action: "create" | "update" | "delete",
) {
  const access = await accountApi(request, true);
  if (access.error) return access.error;
  const { supabase, user } = access.account!;
  let body: unknown;
  try {
    body = await readLimitedJson(request, 4000);
  } catch (error) {
    return NextResponse.json(
      { error: "Проверь данные задачи." },
      { status: error instanceof RangeError ? 413 : 400 },
    );
  }
  if (!isRecord(body) || (action !== "create" && !validUuid(body.id)))
    return NextResponse.json({ error: "Задача не найдена." }, { status: 400 });
  if (action === "delete") {
    const result = await supabase
      .from("follow_ups")
      .delete()
      .eq("id", body.id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (result.error)
      return NextResponse.json(
        { error: "Не удалось удалить дело." },
        { status: 503 },
      );
    if (!result.data)
      return NextResponse.json(
        { error: "Задача не найдена." },
        { status: 404 },
      );
    revalidatePath("/tasks");
    revalidatePath("/");
    return NextResponse.json({ deleted: true });
  }
  const update: Record<string, unknown> = {};
  if (action === "create" || "note" in body) {
    if (
      typeof body.note !== "string" ||
      !body.note.trim() ||
      body.note.trim().length > 240
    )
      return NextResponse.json(
        { error: "Напиши дело: от 1 до 240 символов." },
        { status: 400 },
      );
    update.note = body.note.trim();
  }
  if (action === "create" || "dueDate" in body) {
    if (!validTaskDate(body.dueDate))
      return NextResponse.json(
        { error: "Выбери корректную дату." },
        { status: 400 },
      );
    update.scheduled_for = body.dueDate + "T12:00:00.000Z";
  }
  if ("completed" in body) {
    if (typeof body.completed !== "boolean")
      return NextResponse.json(
        { error: "Проверь статус дела." },
        { status: 400 },
      );
    update.completed_at = body.completed ? new Date().toISOString() : null;
  }
  if ("clientId" in body) {
    if (body.clientId !== null && !validUuid(body.clientId))
      return NextResponse.json(
        { error: "Выбери клиента из своего списка." },
        { status: 400 },
      );
    if (body.clientId) {
      const client = await supabase
        .from("clients")
        .select("id")
        .eq("id", body.clientId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (client.error || !client.data)
        return NextResponse.json(
          { error: "Выбери клиента из своего списка." },
          { status: 400 },
        );
    }
    update.client_id = body.clientId;
  }
  if (!Object.keys(update).length)
    return NextResponse.json(
      { error: "Нет изменений для сохранения." },
      { status: 400 },
    );
  if (action === "create") {
    const count = await supabase
      .from("follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (count.error)
      return NextResponse.json(
        { error: "Не удалось проверить список дел." },
        { status: 503 },
      );
    if ((count.count || 0) >= TASK_LIMIT)
      return NextResponse.json(
        {
          error:
            "В списке уже 200 дел. Удали завершённые, чтобы добавить новые.",
        },
        { status: 409 },
      );
  }
  const query =
    action === "create"
      ? supabase.from("follow_ups").insert({ ...update, user_id: user.id })
      : supabase
          .from("follow_ups")
          .update(update)
          .eq("id", body.id)
          .eq("user_id", user.id);
  const result = await query.select(taskColumns).maybeSingle();
  if (result.error)
    return NextResponse.json(
      { error: "Не удалось сохранить дело. Попробуй ещё раз." },
      { status: 503 },
    );
  if (!result.data)
    return NextResponse.json({ error: "Задача не найдена." }, { status: 404 });
  revalidatePath("/tasks");
  revalidatePath("/");
  return NextResponse.json(
    { task: result.data },
    { status: action === "create" ? 201 : 200 },
  );
}
export function POST(request: Request) {
  return mutate(request, "create");
}
export function PATCH(request: Request) {
  return mutate(request, "update");
}
export function DELETE(request: Request) {
  return mutate(request, "delete");
}
