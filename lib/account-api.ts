import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "./supabase/server";
import { sameOrigin } from "./request-guards";

export async function accountApi(request: Request, mutation = false) {
  if (mutation && !sameOrigin(request))
    return {
      error: NextResponse.json(
        { error: "Запрос разрешён только из приложения." },
        { status: 403 },
      ),
      account: null,
    };
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  )
    return {
      error: NextResponse.json(
        { error: "Подключение аккаунтов пока не настроено." },
        { status: 503 },
      ),
      account: null,
    };
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user)
      return {
        error: NextResponse.json(
          { error: "Войди в аккаунт." },
          { status: 401 },
        ),
        account: null,
      };
    return { error: null, account: { supabase, user } };
  } catch {
    return {
      error: NextResponse.json(
        { error: "Не удалось проверить сессию. Попробуй ещё раз." },
        { status: 503 },
      ),
      account: null,
    };
  }
}
