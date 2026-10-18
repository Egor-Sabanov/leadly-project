import { AuthForm } from "@/components/auth/AuthForm";
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return <AuthForm callbackFailed={params.error === "callback"} />;
}
