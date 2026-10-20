import { vkAccountChange } from "@/lib/vk-account-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return vkAccountChange(request, "confirm");
}
