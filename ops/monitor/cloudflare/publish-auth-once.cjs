const { spawnSync } = require('node:child_process');
const { deploy } = require('./deploy.cjs');
const { limitedJson } = require('../core.cjs');
let operation = 'preflight', secretsBound = false, codePublished = false;
(async () => {
  const token = process.env.LEADLY_MONITOR_GITHUB_TOKEN;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_]{8,512}$/.test(token)) throw Error('github_read_token_missing_or_invalid');
  const response = await fetch('https://api.github.com/repos/Egor-Sabanov/leadly-project/actions/workflows/backup.yml/runs?branch=main&per_page=1', {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'LEADLY-Backup-Monitor/1.0' }, redirect: 'manual', signal: AbortSignal.timeout(20000)
  });
  const quota = Number(response.headers.get('x-ratelimit-limit'));
  console.log(JSON.stringify({ githubTokenConfigured: true, githubActionsHttp: response.status, githubQuotaLimit: Number.isSafeInteger(quota) ? quota : null }));
  const data = await limitedJson(response, 256 * 1024);
  if (!response.ok || !Array.isArray(data.workflow_runs) || data.workflow_runs.length !== 1) throw Error('github_actions_read_preflight_failed');
  async function api(endpoint) {
    const result = await fetch('https://api.cloudflare.com/client/v4' + endpoint, { headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const body = await result.json(); if (!result.ok || body.success !== true) throw Error('auth_update_api_read_failed'); return body.result;
  }
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) { const accounts = await api('/accounts?per_page=50'); if (!Array.isArray(accounts) || accounts.length !== 1) throw Error('auth_update_account_not_explicit'); accountId = accounts[0].id; }
  if (!/^[a-f0-9]{32}$/.test(accountId || '')) throw Error('auth_update_account_invalid');
  const endpoint = '/accounts/' + accountId + '/workers/scripts/leadly-owner-monitor/schedules';
  const before = await api(endpoint);
  if (!Array.isArray(before?.schedules) || before.schedules.length !== 1 || before.schedules[0].cron !== '*/5 * * * *') throw Error('existing_cron_not_confirmed');
  const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, WRANGLER_SEND_METRICS: 'false', MONITOR_RELEASE_ID: 'release-' + process.env.GITHUB_RUN_ID + '-auth' };
  function cli(args, input) {
    const child = spawnSync(process.execPath, [env.LEADLY_WRANGLER_BIN, ...args], { env, input, encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
    if (child.error || child.status !== 0) throw Error('auth_update_cli_failed');
    return child.stdout.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
  }
  let versionId; const requestedAt = Date.now();
  const result = await deploy({ env, testId: '', execute: async (args, input) => {
    if (args[0] === 'secret') { operation = 'bind_secrets'; cli(args, input); secretsBound = true; return; }
    if (args[0] !== 'deploy') throw Error('unexpected_auth_update_command');
    operation = 'upload_version'; const output = cli(['versions', 'upload', ...args.slice(1)]);
    const match = output.match(/Worker Version ID:\s*([a-f0-9-]{36})/i);
    if (!match) throw Error('uploaded_version_id_not_found'); versionId = match[1];
    operation = 'publish_version'; cli(['versions', 'deploy', versionId + '@100', '--yes', '--config', args[args.indexOf('--config') + 1], '--durable-objects-code-update-mode', 'immediate']); codePublished = true;
  } });
  operation = 'verify_cron'; const after = await api(endpoint);
  if (!Array.isArray(after?.schedules) || JSON.stringify(after.schedules.map(item => item.cron)) !== JSON.stringify(before.schedules.map(item => item.cron))) throw Error('cron_changed_during_auth_update');
  console.log(JSON.stringify({ workerAuthPublished: true, githubActionsReadVerified: true, versionId, requestedAt, publishedAt: Date.now(), cronUnchanged: true, setupTestRequested: result.setupTestRequested, secretsBound, codePublished }));
})().catch(error => { console.error(JSON.stringify({ authUpdateVerified: false, operation, secretsBound, codePublished, error: /^[a-z_]+$/.test(error.message) ? error.message : 'worker_auth_update_failed' })); process.exitCode = 1; });
