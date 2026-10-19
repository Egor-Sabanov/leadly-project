/* Read-only operator diagnostics. No auth users, rows, buckets or files are changed. */
const { createClient } = require("@supabase/supabase-js");
const { createTsLoader } = require("./ts-loader.cjs");
const path = require("node:path");
(async () => {
  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, detail });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const boundedFetch = (input, init) =>
    fetch(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  let origin;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !["", "/"].includes(parsed.pathname) ||
      parsed.search ||
      parsed.hash
    )
      throw new Error();
    origin = parsed.origin;
  } catch {
    add(
      "supabase_config",
      "fail",
      "Укажи HTTPS URL проекта Supabase без пути /rest/v1.",
    );
  }
  if (!publicKey)
    add("public_key", "fail", "Публичный ключ аккаунтов не настроен.");
  if (origin && publicKey) {
    const anonymous = createClient(origin, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: boundedFetch },
    });
    const jobs = createTsLoader()(
      path.join(__dirname, "../lib/russian-opportunities.ts"),
    );
    const operations = await Promise.allSettled([
      boundedFetch(origin + "/auth/v1/settings", {
        headers: { apikey: publicKey },
      }).then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
      jobs.loadRussianOpportunities(
        serverKey
          ? createClient(origin, serverKey, {
              auth: { persistSession: false, autoRefreshToken: false },
              global: { fetch: boundedFetch },
            })
          : anonymous,
      ),
      anonymous.from("profiles").select("id").limit(1),
    ]);
    const [auth, opportunities, profiles] = operations;
    if (auth.status === "fulfilled") {
      add("auth", "pass", "Сервис авторизации отвечает.");
      add(
        "google_oauth",
        auth.value.external?.google === true ? "pass" : "pending",
        auth.value.external?.google === true
          ? "Google включён в Auth; живой вход проверяется отдельно."
          : "Google пока не включён в Supabase.",
      );
      const { loadSocialAuthOptions } = createTsLoader({ process })(
        path.join(__dirname, "../lib/auth-provider-settings.ts"),
      );
      const social = await loadSocialAuthOptions();
      for (const option of social.filter((option) => option.id !== "google"))
        add(
          option.id + "_oauth",
          option.enabled ? "pass" : "pending",
          option.label +
            (option.enabled
              ? " включён в Auth; настоящий вход нужно проверить отдельно."
              : " пока не подключён. Данные приложения провайдера сохраняются в Supabase."),
        );
    } else
      add(
        "auth",
        "fail",
        "Сервис авторизации недоступен или публичный ключ не принят.",
      );
    if (opportunities.status === "fulfilled" && !opportunities.value.error)
      add(
        "russian_opportunities",
        opportunities.value.data.length ? "pass" : "pending",
        "В служебной русскоязычной активной выборке: " +
          opportunities.value.data.length +
          ".",
      );
    else
      add(
        "russian_opportunities",
        "fail",
        "Не удалось прочитать ленту возможностей.",
      );
    if (
      profiles.status === "fulfilled" &&
      !profiles.value.error &&
      !profiles.value.data?.length
    )
      add(
        "anonymous_profiles",
        "pass",
        "Анонимный запрос не получил профили. Межаккаунтная изоляция проверяется отдельными живыми тестами.",
      );
    else if (
      profiles.status === "fulfilled" &&
      ["401", "403", "42501"].includes(String(profiles.value.error?.code))
    )
      add("anonymous_profiles", "pass", "Анонимное чтение профилей запрещено.");
    else
      add(
        "anonymous_profiles",
        "fail",
        "Не удалось подтвердить отсутствие анонимной выдачи профилей.",
      );
    if (!serverKey)
      add(
        "avatar_storage",
        "fail",
        "Настрой серверный ключ один раз на сервере приложения. Пользователям ключи не нужны.",
      );
    else {
      try {
        const admin = createClient(origin, serverKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: boundedFetch },
        });
        const { data, error } = await admin.storage.getBucket(
          "leadly-profile-avatars",
        );
        if (error || !data) throw new Error();
        if (
          data.public ||
          !data.file_size_limit ||
          data.file_size_limit > 262144 ||
          !data.allowed_mime_types?.length ||
          !data.allowed_mime_types.every((type) => type === "image/webp")
        )
          add(
            "avatar_storage",
            "fail",
            "Настройки хранилища аватарок требуют проверки: оно должно быть закрытым, WebP, до 256 КиБ.",
          );
        else
          add(
            "avatar_storage",
            "pass",
            "Закрытое хранилище аватарок настроено для всех аккаунтов.",
          );
      } catch {
        add(
          "avatar_storage",
          "fail",
          "Серверный доступ к хранилищу не подтверждён. Проверь ключ и выполни setup:profile-storage.",
        );
      }
    }
  }
  let productionOrigin = false;
  try {
    const site = new URL(process.env.LEADLY_SITE_URL);
    productionOrigin =
      site.protocol === "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(site.hostname) &&
      site.pathname === "/";
  } catch {
    /* Report only readiness, never environment values. */
  }
  add(
    "production_origin",
    productionOrigin ? "pass" : "pending",
    productionOrigin
      ? "HTTPS адрес приложения задан; доступность и callback проверяются отдельно."
      : "Перед публичным запуском нужен постоянный HTTPS адрес приложения.",
  );
  add(
    "scheduled_ingestion",
    "pending",
    "Нужен проверенный запуск импорта по расписанию. Наличие CRON_SECRET само по себе не подтверждает планировщик.",
  );
  add(
    "telegram",
    "pending",
    process.env.TELEGRAM_BOT_TOKEN
      ? "Токен задан; нужно проверить доступ к каналам и доставку webhook."
      : "Нужны бот, согласованные каналы и проверка webhook.",
  );
  add(
    "payments",
    "pending",
    "Реальные платежи и выдача платных прав ещё не подключены.",
  );
  const coreReady = !checks.some((check) => check.status === "fail");
  console.log(
    JSON.stringify(
      { readOnly: true, coreReady, commercialLaunchReady: false, checks },
      null,
      2,
    ),
  );
  if (!coreReady) process.exitCode = 1;
})().catch(() => {
  console.error(
    "Диагностика не завершена. Проверь подключение и настройки среды.",
  );
  process.exitCode = 1;
});
