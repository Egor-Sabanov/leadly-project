const { spawnSync } = require('node:child_process');
const path = require('node:path');
(async () => {
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  async function api(endpoint) {
    const response = await fetch('https://api.cloudflare.com/client/v4' + endpoint, { headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const body = await response.json();
    if (!response.ok || body.success !== true) throw Error('code_update_api_read_failed');
    return body.result;
  }
  if (!accountId) { const accounts = await api('/accounts?per_page=50'); if (!Array.isArray(accounts) || accounts.length !== 1) throw Error('code_update_account_not_explicit'); accountId = accounts[0].id; }
  if (!/^[a-f0-9]{32}$/.test(accountId || '')) throw Error('code_update_account_invalid');
  const endpoint = '/accounts/' + accountId + '/workers/scripts/leadly-owner-monitor/schedules';
  const before = await api(endpoint);
  if (!Array.isArray(before?.schedules) || before.schedules.length !== 1 || before.schedules[0].cron !== '*/5 * * * *') throw Error('existing_cron_not_confirmed');
  const config = path.join(__dirname, 'wrangler.jsonc');
  function cli(args) {
    const child = spawnSync(process.execPath, [process.env.LEADLY_WRANGLER_BIN, ...args], { env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, WRANGLER_SEND_METRICS: 'false' }, encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
    if (child.error || child.status !== 0) throw Error('code_update_cli_failed');
    return child.stdout.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
  }
  const requestedAt = Date.now();
  const output = cli(['versions', 'upload', '--config', config, '--keep-vars', '--var', 'MONITOR_SETUP_TEST_ID:', '--var', 'MONITOR_RELEASE_ID:release-' + process.env.GITHUB_RUN_ID + '-diagnostics']);
  const match = output.match(/Worker Version ID:\s*([a-f0-9-]{36})/i);
  if (!match) throw Error('uploaded_version_id_not_found');
  cli(['versions', 'deploy', match[1] + '@100', '--yes', '--config', config, '--durable-objects-code-update-mode', 'immediate']);
  const after = await api(endpoint);
  if (!Array.isArray(after?.schedules) || JSON.stringify(after.schedules.map(item => item.cron)) !== JSON.stringify(before.schedules.map(item => item.cron))) throw Error('cron_changed_during_code_update');
  console.log(JSON.stringify({ workerCodePublished: true, versionId: match[1], requestedAt, publishedAt: Date.now(), cronUnchanged: true, setupTestRequested: false }));
})().catch(error => { console.error(JSON.stringify({ codeUpdateVerified: false, error: /^[a-z_]+$/.test(error.message) ? error.message : 'worker_code_update_failed' })); process.exitCode = 1; });
