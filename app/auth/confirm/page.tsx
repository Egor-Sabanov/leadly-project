import { EmailConfirmation } from "@/components/auth/EmailConfirmation";
import { emailConfirmation } from "@/lib/auth-feedback";

export const dynamic = "force-dynamic";
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const query = await searchParams;
  return <EmailConfirmation confirmation={emailConfirmation(query.token_hash, query.type)} />;
}
