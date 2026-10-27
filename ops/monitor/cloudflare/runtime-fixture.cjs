// Optional native Workers check. Requires the pinned Wrangler's Miniflare and
// a dry-run bundle path. Every outbound request is intercepted by this fixture.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Miniflare, Response, convertV4MiniflareOptions } = require("miniflare");
const { backupFixture, fixturePayload } = require('../backup.fixture.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), "leadly-worker-fixture-"));
let mf, status = "ok", probes = 0, sends = 0, github = 0;
let backup = backupFixture();
function options() {
  return convertV4MiniflareOptions({
    name: "leadly-owner-monitor-fixture",
    modules: true,
    scriptPath: path.join(root, 'fixture.mjs'),
    modulesRoot: root,
    rootPath: root,
    compatibilityDate: "2026-10-22",
    durableObjects: { OWNER_MONITOR: { className: "FixtureOwnerMonitor", useSQLite: true } },
    resourcePersistencePath: root,
    cf: false,
    telemetry: { enabled: false },
    bindings: {
      TELEGRAM_BOT_TOKEN: "123456:fixture-token-with-at-least-20-characters",
      TELEGRAM_CHAT_ID: "123456789",
      MONITOR_SETUP_TEST_ID: "native-fixture-once",
    },
    outboundService: async request => {
      const url = new URL(request.url);
      if (url.origin === "https://leadly-topaz-seven.vercel.app" && url.pathname === "/api/status") {
        probes++;
        return Response.json({ status, checkedAt: new Date().toISOString() }, { status: status === "ok" ? 200 : 503 });
      }
      if (url.hostname === 'api.github.com') {
        github++;
        assert.equal(request.headers.get('authorization'), null);
        return Response.json(fixturePayload(url, [backup]));
      }
      assert.equal(url.hostname, "api.telegram.org");
      if (url.pathname.endsWith("/getMe")) return Response.json({ ok: true, result: { id: 123456, is_bot: true, username: "leadly_work_bot" } });
      assert(url.pathname.endsWith("/sendMessage"));
      const body = await request.json(); assert.equal(body.chat_id, "123456789"); sends++;
      return Response.json({ ok: true, result: { message_id: sends, chat: { id: 123456789 } } });
    },
  });
}
async function check() {
  const namespace = await mf.getDurableObjectNamespace("OWNER_MONITOR");
  const object = namespace.get(namespace.idFromName("leadly-owner-monitor-v1"));
  const response = await object.fetch("https://monitor.internal/check", { method: "POST" });
  return { code: response.status, ...await response.json() };
}
async function refreshBackup() {
  const namespace = await mf.getDurableObjectNamespace('OWNER_MONITOR');
  const object = namespace.get(namespace.idFromName('leadly-owner-monitor-v1'));
  assert.equal((await object.fetch('https://fixture.internal/expire-backup', { method: 'POST' })).status, 200);
}
function basic(result) { return { code: result.code, status: result.status, notification: result.notification }; }
(async () => {
  try {
    assert(process.argv[2], "dry_run_bundle_required");
    const bundle = fs.readFileSync(path.resolve(process.argv[2]), 'utf8');
    assert(/(?:var|class) OwnerMonitor\b/.test(bundle), 'bundled_owner_class_required');
    // This binding-only fixture method is generated outside the deployed bundle.
    // Production public routes remain 404 and cannot reset state or trigger sends.
    fs.writeFileSync(path.join(root, 'fixture.mjs'), bundle + `
      export class FixtureOwnerMonitor extends OwnerMonitor {
        async fetch(request) {
          const url = new URL(request.url);
          if (request.method === 'POST' && url.origin === 'https://fixture.internal' && url.pathname === '/expire-backup') {
            await this.ctx.storage.delete('backupCache');
            return Response.json({ cleared: true });
          }
          return super.fetch(request);
        }
      }
    `);
    mf = new Miniflare(options());
    assert.equal((await mf.dispatchFetch("https://fixture.invalid/check")).status, 404);
    assert.equal((await mf.dispatchFetch('https://fixture.invalid/fixtureDropBackupCache')).status, 404);
    const initial = await check();
    assert.deepEqual(basic(initial), { code: 200, status: "ok", notification: "sent" });
    assert.equal(initial.backup, 'ok'); assert.equal(github, 3);
    assert.equal(sends, 1);
    await mf.dispose(); mf = new Miniflare(options());
    assert.deepEqual(basic(await check()), { code: 200, status: "ok", notification: "none" });
    assert.equal(github, 3);
    assert.equal(sends, 1);
    status = "degraded"; const before = probes;
    const results = await Promise.all([check(), check()]);
    for (const result of results) assert.deepEqual(basic(result), { code: 503, status: "degraded", notification: "sent" });
    assert.equal(probes - before, 2); assert.equal(sends, 2);
    status = "ok";
    assert.deepEqual(basic(await check()), { code: 200, status: "ok", notification: "sent" });
    assert.deepEqual(basic(await check()), { code: 200, status: "ok", notification: "none" });
    assert.equal(sends, 3);
    backup = backupFixture(Date.now(), { age: 25 * 3600000 });
    await refreshBackup();
    const stale = await check();
    assert.deepEqual(basic(stale), { code: 503, status: 'degraded', notification: 'sent' });
    assert.equal(stale.backup, 'stale'); assert.equal(stale.site, 'ok'); assert.equal(sends, 4);
    const reads = github;
    await mf.dispose(); mf = new Miniflare(options());
    assert.equal((await check()).notification, 'none');
    assert.equal(sends, 4); assert.equal(github, reads);
    backup = backupFixture(Date.now(), { id: 1002 });
    await refreshBackup();
    assert.deepEqual(basic(await check()), { code: 200, status: 'ok', notification: 'sent' });
    assert.deepEqual(basic(await check()), { code: 200, status: 'ok', notification: 'none' });
    assert.equal(sends, 5);
    console.log(JSON.stringify({ nativeWorkersRuntime: true, sqliteStateSurvivedRestart: true,
      backupCacheSurvivedRestart: true, overlappingTicksCoalesced: true,
      incidentAndRecoveryVerified: true, backupIncidentAndRecoveryVerified: true, realOutboundRequests: 0 }));
  } finally {
    if (mf) await mf.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
