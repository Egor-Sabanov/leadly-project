import { vkAccountStatus, vkAccountChange } from "@/lib/vk-account-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return vkAccountStatus(request);
}
export async function DELETE(request: Request) {
  return vkAccountChange(request, "remove");
}
