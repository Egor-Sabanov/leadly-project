import { NextResponse } from "next/server";
import { accountApi } from "@/lib/account-api";
import { readLimitedJson, isRecord } from "@/lib/request-guards";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const auth = await accountApi(request, true);
  if (auth.error) return auth.error;
  let body;
  try {
    body = await readLimitedJson(request, 1000);
  } catch {
    return NextResponse.json(
      { error: "Не удалось прочитать подтверждение." },
      { status: 400, headers },
    );
  }
  if (
    !isRecord(body) ||
    body.accepted !== true ||
    body.version !== PRIVACY_NOTICE_VERSION
  )
    return NextResponse.json(
      { error: "Ознакомься с актуальными условиями обработки данных." },
      { status: 400, headers },
    );
  try {
    const { error } = await auth.account!.supabase.auth.updateUser({
      data: {
        privacy_notice_version: PRIVACY_NOTICE_VERSION,
        privacy_notice_acknowledged_at: new Date().toISOString(),
      },
    });
    if (error) throw error;
    return NextResponse.json({ saved: true }, { headers });
  } catch {
    return NextResponse.json(
      { error: "Не удалось сохранить подтверждение. Попробуй ещё раз." },
      { status: 503, headers },
    );
  }
}
