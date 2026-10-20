import { accountApi } from "@/lib/account-api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await accountApi(request);
  if (auth.error) return auth.error;
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const result = await auth.account!.supabase.from("opportunities").select("id,discovered_at").eq("is_active", true).order("discovered_at", { ascending: false }).limit(1);
    if (result.error) throw new Error();
    return Response.json({ version: result.data?.[0]?.discovered_at || null }, { headers });
  } catch { return Response.json({ error: "Не удалось проверить обновления." }, { status: 503, headers }); }
}
