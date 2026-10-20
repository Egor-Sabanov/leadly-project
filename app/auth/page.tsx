import { AuthForm } from "@/components/auth/AuthForm";
import { loadSocialAuthOptions } from "@/lib/auth-provider-settings";
import { PROVIDER_EMAIL_NOTICE } from "@/lib/oauth-callback";
export const dynamic = "force-dynamic";
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const [params, socialOptions] = await Promise.all([
    searchParams,
    loadSocialAuthOptions(),
  ]);
  return (
    <AuthForm
      initialMessage={params.error === "email_verification" ? PROVIDER_EMAIL_NOTICE : undefined}
      initialMode={params.error === "email_verification" ? "confirm" : params.mode === "recovery" || params.mode === "confirm" || params.mode === "signin" ? params.mode : "signup"}
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
