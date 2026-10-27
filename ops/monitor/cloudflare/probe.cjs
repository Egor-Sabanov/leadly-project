const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
(async () => {
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) {
    const response = await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=50', { headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN }, signal: AbortSignal.timeout(20000) });
    const body = await response.json();
    if (!response.ok || body.success !== true || !Array.isArray(body.result) || body.result.length !== 1) throw Error('probe_account_read_failed');
    accountId = body.result[0].id;
  }
  if (!/^[a-f0-9]{32}$/.test(accountId || '')) throw Error('probe_account_invalid');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'leadly-cf-probe-'));
  const config = path.join(temp, 'wrangler.json');
  fs.writeFileSync(config, JSON.stringify({ name: 'leadly-backup-probe', main: path.join(__dirname, 'probe.mjs'), compatibility_date: '2026-10-22', workers_dev: false, preview_urls: false }));
  const child = spawn(process.execPath, [process.env.LEADLY_WRANGLER_BIN, 'dev', '--remote', '--config', config, '--port', '8899', '--ip', '127.0.0.1'], { env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let closed = false; child.on('close', () => { closed = true; }); child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60 && !closed; attempt++) {
      try { const response = await fetch('http://127.0.0.1:8899/health', { signal: AbortSignal.timeout(1500) }); if (response.ok && await response.text() === 'ready') { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw Error('remote_probe_not_ready');
    const response = await fetch('http://127.0.0.1:8899/probe', { signal: AbortSignal.timeout(60000) });
    const body = await response.json(); if (!response.ok || !body.cloudflareBackupProbe) throw Error('remote_probe_failed');
    console.log(JSON.stringify(body));
  } finally { child.kill('SIGTERM'); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(JSON.stringify({ probeFailed: true, error: /^[a-z_]+$/.test(error.message) ? error.message : 'cloudflare_probe_failed' })); process.exitCode = 1; });
