import { vkCallback } from "@/lib/vk-oauth";
import { vkAccountCallback } from "@/lib/vk-account-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("state")?.startsWith("lvk_"))
    return vkAccountCallback(request);
  return vkCallback(request);
}
