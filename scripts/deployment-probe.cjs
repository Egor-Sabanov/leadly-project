/** Read-only checks: no signup, messages, imports, account mutations or OAuth exchanges. */
function siteOrigin(value, allowLocal = false) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (local
      ? !allowLocal || !["http:", "https:"].includes(url.protocol)
      : url.protocol !== "https:" || !!url.port)
  )
    throw new Error(
      "Нужен HTTPS адрес сайта без пути, параметров и пароля. Локальный HTTP разрешён только с --local.",
    );
  return url.origin;
}
async function probeDeployment(
  target,
  { allowLocal = false, fetcher = fetch, supabaseOrigin } = {},
) {
  const origin = siteOrigin(target, allowLocal);
  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, detail });
  async function request(path, body = false) {
    const response = await fetcher(origin + path, {
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "LEADLY-deployment-check/1" },
    });
    let text = "";
    if (body && response.body) {
      const reader = response.body.getReader();
      const parts = [];
      let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1_000_000) {
            await reader.cancel();
            throw new Error("Response too large");
          }
          parts.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      text = Buffer.concat(parts).toString("utf8");
    } else if (response.body) await response.body.cancel();
    return { response, text };
  }
  function location(response) {
    const raw = response.headers.get("location");
    return raw ? new URL(raw, origin) : null;
  }
  function ownRedirect(response, pathname, error) {
    try {
      const to = location(response);
      return (
        [303, 307, 308].includes(response.status) &&
        to?.origin === origin &&
        to.pathname === pathname &&
        (!error || to.searchParams.get("error") === error)
      );
    } catch {
      return false;
    }
  }
  let entry;
  try {
    entry = await request("/auth", true);
  } catch {
    add(
      "entry",
      "fail",
      "Сайт не ответил по защищённому соединению. Проверь адрес, TLS и доступность deployment.",
    );
  }
  if (
    !entry ||
    entry.response.status !== 200 ||
    !entry.response.headers.get("content-type")?.includes("text/html") ||
    !entry.text.includes("LEADLY")
  ) {
    if (entry)
      add(
        "entry",
        "fail",
        "Страница входа не открылась: HTTP " +
          entry.response.status +
          ". Проверь сборку и защиту доступа Vercel.",
      );
    return {
      target: origin,
      readOnly: true,
      transportReady: false,
      realUserSignInVerified: false,
      checks,
    };
  }
  add("entry", "pass", "Страница входа LEADLY открылась.");
  const headers = entry.response.headers;
  const ancestors = (headers.get("content-security-policy") || "").split(";").map(value => value.trim()).find(value => value.startsWith("frame-ancestors"));
  const safeFrames = ancestors
    ? ancestors === "frame-ancestors 'self' https://web.telegram.org https://webk.telegram.org https://webz.telegram.org"
    : headers.get("x-frame-options") === "DENY";
  add(
    "security_headers",
    headers.get("x-content-type-options") === "nosniff" && safeFrames
      ? "pass"
      : "fail",
    "Проверены nosniff и запрет iframe вне разрешённых Telegram Web origins.",
  );
  add(
    "auth_cache",
    /private|no-store/i.test(headers.get("cache-control") || "")
      ? "pass"
      : "fail",
    "Страница авторизации не должна храниться в общем кеше.",
  );
  const asset = entry.text.match(
    /(?:src|href)="([^"<>]*\/_next\/static\/[^"<>]+\.(?:js|css)(?:\?[^"<>]*)?)"/,
  );
  const paths = [
    "/",
    "/profile",
    "/api/profile/avatar",
    "/api/tasks",
    "/privacy",
    "/auth/callback?next=https://example.invalid",
    "/auth/callback?error=access_denied",
    "/auth/social/unknown",
    "/auth/social/google",
  ];
  const results = await Promise.allSettled(
    paths.map((path) => request(path, path === "/privacy")),
  );
  for (let index = 0; index < paths.length; index++) {
    const path = paths[index],
      item = results[index];
    const id =
      path === "/"
        ? "private_home"
        : path.replace(/[/?=&:.]+/g, "_").replace(/^_/, "");
    if (item.status !== "fulfilled") {
      add(id, "fail", "Запрос проверки не завершён.");
      continue;
    }
    const { response, text } = item.value;
    if (path === "/" || path === "/profile")
      add(
        id,
        ownRedirect(response, "/auth") ? "pass" : "fail",
        "Личная страница гостю должна перенаправлять на вход этого сайта.",
      );
    else if (path.startsWith("/api/"))
      add(
        id,
        response.status === 401 ? "pass" : "fail",
        "Личный API без сессии: HTTP " +
          response.status +
          ". Это не проверка загрузки файла вошедшим пользователем.",
      );
    else if (path === "/privacy")
      add(
        id,
        response.status === 200 &&
          text.includes("Обработка персональных данных")
          ? "pass"
          : "fail",
        "Уведомление об обработке данных доступно.",
      );
    else if (path.startsWith("/auth/callback")) {
      const expected = path.includes("access_denied") ? "oauth" : "callback";
      add(
        id,
        ownRedirect(response, "/auth", expected) ? "pass" : "fail",
        "Callback с ошибкой возвращает на этот сайт; внешний next игнорируется.",
      );
    } else if (path === "/auth/social/unknown")
      add(
        id,
        ownRedirect(response, "/auth", "provider") ? "pass" : "fail",
        "Неизвестный провайдер не открывает произвольный адрес.",
      );
    else {
      if (ownRedirect(response, "/auth", "provider")) {
        add(
          "google_oauth",
          "pending",
          "Google ещё не включён. Настрой OAuth-приложение в Supabase, затем повтори проверку.",
        );
        continue;
      }
      let correct = false;
      try {
        const to = location(response);
        const expectedSupabase = supabaseOrigin
          ? new URL(supabaseOrigin).origin
          : null;
        correct =
          [303, 307, 308].includes(response.status) &&
          to?.protocol === "https:" &&
          !to.username &&
          !to.password &&
          (expectedSupabase
            ? to.origin === expectedSupabase
            : to.hostname.endsWith(".supabase.co")) &&
          to.pathname === "/auth/v1/authorize" &&
          to.searchParams.get("provider") === "google" &&
          to.searchParams.get("redirect_to") === origin + "/auth/callback" &&
          to.searchParams.get("code_challenge_method") === "s256" &&
          /^[a-zA-Z0-9_-]{40,128}$/.test(
            to.searchParams.get("code_challenge") || "",
          ) &&
          /code-verifier=/.test(response.headers.get("set-cookie") || "");
      } catch {
        /* Invalid redirect must fail without printing URLs or verifier cookies. */
      }
      add(
        "google_oauth",
        correct ? "pass" : "fail",
        correct
          ? "Переход Google использует Supabase, PKCE и callback этого сайта. Вход в настоящий Google-аккаунт ещё не проверен."
          : "OAuth-переход некорректен. Проверь canonical origin, Supabase и PKCE.",
      );
    }
  }
  if (asset) {
    try {
      const url = new URL(asset[1].replace(/&amp;/g, "&"), origin);
      if (url.origin !== origin) throw new Error();
      const { response } = await request(url.pathname + url.search);
      add(
        "static_asset",
        response.status === 200 ? "pass" : "fail",
        "Проверена доставка файла сборки Next.js.",
      );
    } catch {
      add("static_asset", "fail", "Файл сборки Next.js не загрузился.");
    }
  } else
    add("static_asset", "fail", "На странице не найден файл сборки Next.js.");
  return {
    target: origin,
    readOnly: true,
    transportReady: !checks.some((check) => check.status === "fail"),
    realUserSignInVerified: false,
    checks,
  };
}
module.exports = { siteOrigin, probeDeployment };
