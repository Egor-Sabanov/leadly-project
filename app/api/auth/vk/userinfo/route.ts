import { vkUserinfo } from "@/lib/vk-oauth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return vkUserinfo(request);
}
