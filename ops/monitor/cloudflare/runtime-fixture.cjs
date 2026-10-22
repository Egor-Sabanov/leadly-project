// Optional native Workers check. Requires the pinned Wrangler's Miniflare and
// a dry-run bundle path. Every outbound request is intercepted by this fixture.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Miniflare, Response, convertV4MiniflareOptions } = require("miniflare");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "leadly-worker-fixture-"));
let mf, status = "ok", probes = 0, sends = 0;
function options() {
  return convertV4MiniflareOptions({
    name: "leadly-owner-monitor-fixture",
    modules: true,
    scriptPath: path.resolve(process.argv[2]),
    modulesRoot: path.dirname(path.resolve(process.argv[2])),
    rootPath: path.dirname(path.resolve(process.argv[2])),
    compatibilityDate: "2026-10-22",
    durableObjects: { OWNER_MONITOR: { className: "OwnerMonitor", useSQLite: true } },
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
(async () => {
  try {
    assert(process.argv[2], "dry_run_bundle_required");
    mf = new Miniflare(options());
    assert.equal((await mf.dispatchFetch("https://fixture.invalid/check")).status, 404);
    assert.deepEqual(await check(), { code: 200, status: "ok", notification: "sent" });
    assert.equal(sends, 1);
    await mf.dispose(); mf = new Miniflare(options());
    assert.deepEqual(await check(), { code: 200, status: "ok", notification: "none" });
    assert.equal(sends, 1);
    status = "degraded"; const before = probes;
    const results = await Promise.all([check(), check()]);
    for (const result of results) assert.deepEqual(result, { code: 503, status: "degraded", notification: "sent" });
    assert.equal(probes - before, 2); assert.equal(sends, 2);
    status = "ok";
    assert.deepEqual(await check(), { code: 200, status: "ok", notification: "sent" });
    assert.deepEqual(await check(), { code: 200, status: "ok", notification: "none" });
    assert.equal(sends, 3);
    console.log(JSON.stringify({ nativeWorkersRuntime: true, sqliteStateSurvivedRestart: true, overlappingTicksCoalesced: true, incidentAndRecoveryVerified: true, realOutboundRequests: 0 }));
  } finally {
    if (mf) await mf.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
