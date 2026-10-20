import { vkToken } from "@/lib/vk-oauth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return vkToken(request);
}
