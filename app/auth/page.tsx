import { AuthForm } from "@/components/auth/AuthForm";
import { loadSocialAuthOptions } from "@/lib/auth-provider-settings";
export const dynamic = "force-dynamic";
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [params, socialOptions] = await Promise.all([
    searchParams,
    loadSocialAuthOptions(),
  ]);
  return (
    <AuthForm
      callbackFailed={params.error === "callback"}
      socialError={
        params.error === "provider"
          ? "Этот способ входа пока недоступен. Выбери другой сервис или войди по почте."
          : params.error === "oauth"
            ? "Вход через сервис отменён или не завершён. Попробуй ещё раз."
            : undefined
      }
      socialOptions={socialOptions}
    />
  );
}
