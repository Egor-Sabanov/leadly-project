/* Operator-only CLI; uses the same guarded parser and writes as the scheduled endpoint. */
const crypto = require("node:crypto");
const path = require("node:path");
const { createTsLoader } = require("./ts-loader.cjs");
(async () => {
  if (process.argv.includes("--rss-only")) {
    process.env.LEADLY_HH_ENABLED = "false";
    process.env.FREELANCEHUNT_API_TOKEN = "";
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Нужен серверный ключ в защищённых настройках среды.");
  const previous = process.env.CRON_SECRET;
  const token = crypto.randomBytes(32).toString("hex");
  process.env.CRON_SECRET = token;
  try {
    const load = createTsLoader({
      process,
      Buffer,
      AbortController,
      setTimeout,
      clearTimeout,
    });
    const { GET } = load(
      path.join(__dirname, "../app/api/cron/ingest/route.ts"),
    );
    const result = await GET(
      new Request("http://localhost/api/cron/ingest", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const body = await result.json();
    console.log(JSON.stringify(body, null, 2));
    if (
      !result.ok ||
      body.ok === false ||
      body.results?.some((row) => row.error)
    )
      process.exitCode = 1;
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
})().catch(() => {
  console.error(
    "Импорт не завершён: проверь подключение и настройки источников.",
  );
  process.exitCode = 1;
});
