const { probeDeployment } = require("./deployment-probe.cjs");
(async () => {
  const args = process.argv.slice(2),
    allowLocal = args.includes("--local");
  const target =
    args.find((arg) => !arg.startsWith("--")) || process.env.LEADLY_SITE_URL;
  if (!target || args.some((arg) => arg.startsWith("--") && arg !== "--local"))
    throw new Error(
      "Использование: npm run check:deployment -- https://адрес-сайта. Для внутренней проверки добавь --local.",
    );
  const report = await probeDeployment(target, {
    allowLocal,
    supabaseOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.transportReady) process.exitCode = 1;
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
