const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const configPath = path.join(__dirname, "wrangler.jsonc");

async function deploy({ env = process.env, fetcher = fetch, execute, testId = "" } = {}) {
  if (!env.CLOUDFLARE_API_TOKEN || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error("monitor_deploy_secrets_missing");
  if (testId && !/^[a-zA-Z0-9_-]{1,64}$/.test(testId)) throw new Error("invalid_setup_test_id");
  const releaseId = env.MONITOR_RELEASE_ID || 'release-' + Date.now();
  if (releaseId && !/^[a-zA-Z0-9_-]{1,64}$/.test(releaseId)) throw new Error('invalid_monitor_release_id');
  async function api(endpoint, allowMissing = false) {
    const response = await fetcher("https://api.cloudflare.com/client/v4" + endpoint, {
      headers: { Authorization: "Bearer " + env.CLOUDFLARE_API_TOKEN },
      redirect: "manual", signal: AbortSignal.timeout(20000),
    });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error("cloudflare_account_or_worker_read_failed");
    const body = await response.json();
    if (body.success !== true) throw new Error("invalid_cloudflare_response");
    return body.result;
  }
  let account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!account) {
    const accounts = await api("/accounts?per_page=50");
    if (!Array.isArray(accounts)) throw new Error("invalid_cloudflare_response");
    if (accounts.length !== 1) throw new Error("cloudflare_account_must_be_explicit");
    account = accounts[0].id;
  }
  if (!/^[a-f0-9]{32}$/.test(account)) throw new Error("invalid_cloudflare_account_id");
  const cliEnv = { ...env, CLOUDFLARE_ACCOUNT_ID: account, WRANGLER_SEND_METRICS: "false" };
  const run = execute || ((args, input) => {
    if (!env.LEADLY_WRANGLER_BIN) throw new Error("wrangler_path_missing");
    const result = spawnSync(process.execPath, [env.LEADLY_WRANGLER_BIN, ...args], { env: cliEnv, input, encoding: "utf8", timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
    // CLI output can include account configuration. Emit only fixed codes.
    if (result.error || result.status !== 0) throw new Error("cloudflare_monitor_deploy_step_failed");
  });
  const schedules = await api("/accounts/" + account + "/workers/scripts/leadly-owner-monitor/schedules", true);
  // The schedules endpoint returns { schedules: [...] }, unlike /accounts.
  // Validate before any CLI write so an invalid response cannot bootstrap a
  // dormant replacement for an already configured Worker.
  if (schedules !== null && (!schedules || !Array.isArray(schedules.schedules))) throw new Error("invalid_cloudflare_response");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "leadly-monitor-deploy-"));
  try {
    if (schedules === null) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const dormant = { ...config, main: path.join(__dirname, "worker.mjs"), triggers: { crons: [] } };
      const bootstrap = path.join(temp, "wrangler.json");
      fs.writeFileSync(bootstrap, JSON.stringify(dormant), { mode: 0o600 });
      await run(["deploy", "--config", bootstrap, "--keep-vars"]);
    }
    // stdin goes directly to Wrangler; secret values never enter argv or logs.
    await run(["secret", "bulk", "--config", configPath], JSON.stringify({ TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID }));
    await run(["deploy", "--config", configPath, "--keep-vars", "--var", "MONITOR_SETUP_TEST_ID:" + testId,
      '--var', 'MONITOR_RELEASE_ID:' + releaseId]);
    return { cloudflareMonitorDeployed: true, cronConfigured: true, setupTestRequested: Boolean(testId), naturalExecutionVerified: false, accountId: account };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
module.exports = { deploy };
if (require.main === module) {
  const since = Date.now(); let published = false;
  deploy({ testId: process.env.MONITOR_SETUP_TEST_ID || '' })
    .then(async ({ accountId, ...result }) => {
      published = true;
      if (process.env.MONITOR_OBSERVE === 'true') {
        const { observe } = require('./observe.cjs');
        Object.assign(result, await observe({ accountId, since }));
      }
      console.log(JSON.stringify(result));
    })
    .catch(error => { console.error(JSON.stringify({ deployed: published, observationVerified: false,
      error: /^[a-z_]+$/.test(error.message) ? error.message : 'cloudflare_monitor_deployment_failed' })); process.exitCode = 1; });
}
