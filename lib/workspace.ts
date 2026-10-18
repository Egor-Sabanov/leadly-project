import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getAccount() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  )
    return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/auth");
  return { supabase, user };
}

export const statusLabels: Record<string, string> = {
  new: "Новая",
  saved: "Сохранена",
  applied: "Отклик отправлен",
  replied: "Получен ответ",
  negotiating: "Переговоры",
  won: "Успех",
  lost: "Не подошла",
  archived: "Архив",
};

export function formatMoney(value: number, currency = "RUB") {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export { safeSourceUrl } from "./links";
