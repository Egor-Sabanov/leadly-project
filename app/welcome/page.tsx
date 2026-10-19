import { redirect } from "next/navigation";
import { getAccount } from "@/lib/workspace";
import { BrandWelcome } from "@/components/brand/BrandWelcome";
import { needsSocialPrivacyNotice } from "@/lib/privacy";
import { SocialPrivacyNotice } from "@/components/auth/SocialPrivacyNotice";
import { telegramDestination } from "@/lib/telegram-navigation";

export const dynamic = "force-dynamic";
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const query = await searchParams;
  const account = await getAccount();
  if (!account) redirect("/auth");
  if (needsSocialPrivacyNotice(account.user)) return <SocialPrivacyNotice />;
  const { data } = await account.supabase
    .from("profiles")
    .select("display_name,onboarding_completed")
    .eq("id", account.user.id)
    .maybeSingle();
  return (
    <BrandWelcome
      name={data?.display_name || ""}
      destination={data?.onboarding_completed ? telegramDestination(query.next) : "/onboarding"}
    />
  );
}
