const assert = require("node:assert/strict");
const core = require("../core.cjs");
const { backupFixture, fixturePayload } = require('../backup.fixture.cjs');

const token = "123456:fixture-token-with-at-least-20-characters";
const chatId = "123456789";
const request = () => new Request("https://monitor.internal/check", { method: "POST" });
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
function storage(initial) {
  const values = new Map([["state", initial], ['backupCache', backupFixture().cache], ['backupReleaseId', 'backup-v1']]);
  const writes = [];
  return { writes, get: async (key = "state") => structuredClone(values.get(key)), put: async (key, value) => { values.set(key, structuredClone(value)); if (key === "state") writes.push(structuredClone(value)); } };
}
const valid = () => ({ version: 1, lastStatus: null, noticeStatus: null, lastAttemptAt: 0, retryAfter: 0, pending: false });
(async () => {
  const hooks = require("node:module").registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "cloudflare:workers") return { shortCircuit: true, url: "data:text/javascript,export class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env;} }" };
      return next(specifier, context);
    },
  });
  const { default: worker, OwnerMonitor } = await import("./worker.mjs");
  hooks.deregister();
  await test("public HTTP routes cannot trigger probes, tests or notifications", async () => {
    for (const path of ["/", "/check", "/setup-test", "/cdn-cgi/handler/scheduled"]) {
      assert.equal(worker.fetch(new Request("https://monitor.example" + path)).status, 404);
    }
  });
  await test("cron uses one fixed private object and awaits failures", async () => {
    const calls = [], pending = [];
    const env = { OWNER_MONITOR: { idFromName: name => { calls.push(name); return "id"; }, get: id => { assert.equal(id, "id"); return { fetch: async (url, options) => { calls.push({ url, options }); return Response.json({ error: "owner_monitor_failed" }, { status: 503 }); } }; } } };
    worker.scheduled({}, env, { waitUntil: p => pending.push(p) });
    assert.equal(calls[0], "leadly-owner-monitor-v1");
    assert.deepEqual(calls[1], { url: "https://monitor.internal/check", options: { method: "POST" } });
    await assert.rejects(pending[0], /owner_monitor_requires_attention/);
  });
  await test("private object rejects other methods and routes before reading secrets", async () => {
    const object = new OwnerMonitor({}, {});
    assert.equal((await object.fetch(new Request("https://monitor.internal/check"))).status, 404);
    assert.equal((await object.fetch(new Request("https://monitor.internal/wrong", { method: "POST" }))).status, 404);
  });
  await test("overlapping ticks share one check and return independently readable results", async () => {
    const object = new OwnerMonitor({}, {});
    let release, checks = 0;
    object.check = () => { checks++; return new Promise(resolve => { release = resolve; }); };
    const first = object.fetch(request()), second = object.fetch(request());
    assert.equal(checks, 1); release({ status: "ok", notification: "none" });
    const responses = await Promise.all([first, second]);
    for (const response of responses) { assert.equal(response.status, 200); assert.equal((await response.json()).status, "ok"); }
    object.check = async () => { checks++; return { status: "ok", notification: "none" }; };
    await object.fetch(request()); assert.equal(checks, 2);
  });
  await test("healthy bootstrap uses durable storage without Telegram calls", async () => {
    const saved = storage(), calls = [], original = global.fetch;
    try {
      global.fetch = async url => { calls.push(url); return Response.json({ status: "ok", checkedAt: new Date().toISOString() }); };
      const response = await new OwnerMonitor({ storage: saved }, { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId }).fetch(request());
      assert.equal(response.status, 200); assert.equal(calls.length, 1); assert.equal(saved.writes.length, 1);
      assert(!JSON.stringify(saved.writes).includes(token)); assert(!JSON.stringify(saved.writes).includes(chatId));
    } finally { global.fetch = original; }
  });
  await test("a restarted object respects previously persisted ambiguous-send suppression", async () => {
    const initial = { ...valid(), lastStatus: "unavailable", noticeStatus: "unavailable", lastAttemptAt: Date.now(), pending: true };
    const saved = storage(initial), original = global.fetch;
    try {
      global.fetch = async url => { assert(url.endsWith("/api/status")); return Response.json({ status: "ok", checkedAt: new Date().toISOString() }); };
      const response = await new OwnerMonitor({ storage: saved }, { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId }).fetch(request());
      assert.equal(response.status, 200); assert.equal((await response.json()).notification, "none");
      assert.equal(saved.writes.at(-1).pending, false); assert.equal(saved.writes.at(-1).retryAfter, initial.lastAttemptAt + 6 * 3600000);
    } finally { global.fetch = original; }
  });
  await test("an explicit setup ID sends once across object restarts and never becomes a public route", async () => {
    const saved = storage(), original = global.fetch; let sends = 0;
    try {
      global.fetch = async url => {
        if (url.endsWith("/api/status")) return Response.json({ status: "ok", checkedAt: new Date().toISOString() });
        if (url.endsWith("/getMe")) return Response.json({ ok: true, result: { id: 123456, is_bot: true, username: "leadly_work_bot" } });
        assert.equal(await saved.get("setupTestId"), "activation-one"); sends++;
        return Response.json({ ok: true, result: { message_id: sends, chat: { id: Number(chatId) } } });
      };
      const env = { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId, MONITOR_SETUP_TEST_ID: "activation-one" };
      assert.equal((await (await new OwnerMonitor({ storage: saved }, env).fetch(request())).json()).notification, "sent");
      assert.equal((await (await new OwnerMonitor({ storage: saved }, env).fetch(request())).json()).notification, "none");
      assert.equal(sends, 1);
    } finally { global.fetch = original; }
  });
  await test("failed persistence prevents any outbound notification", async () => {
    const original = global.fetch, now = Date.now(); let sends = 0;
    try {
      global.fetch = async url => {
        if (url.endsWith("/api/status")) return Response.json({ status: "ok", checkedAt: new Date(now).toISOString() });
        if (url.endsWith("/getMe")) return Response.json({ ok: true, result: { id: 123456, is_bot: true, username: "leadly_work_bot" } });
        sends++; throw new Error("must not send");
      };
      const saved = { get: async key => key === 'backupCache' ? backupFixture().cache : ({ ...valid(), lastStatus: "degraded", noticeStatus: "degraded" }), put: async () => { throw new Error("private-storage-failure"); } };
      const response = await new OwnerMonitor({ storage: saved }, { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId }).fetch(request());
      assert.equal(response.status, 503); assert.equal(sends, 0); assert.deepEqual(await response.json(), { error: "owner_monitor_failed" });
    } finally { global.fetch = original; }
  });
  await test("shared async state engine sends one incident and one recovery across instances", async () => {
    const saved = storage(), now = Date.now(); let status = "degraded", sends = 0, checks = 0;
    const fetcher = async (url, options) => {
      if (url.endsWith("/api/status")) { checks++; return Response.json({ status, checkedAt: new Date(now).toISOString() }, { status: status === "ok" ? 200 : 503 }); }
      if (url.endsWith("/getMe")) return Response.json({ ok: true, result: { id: 123456, is_bot: true, username: "leadly_work_bot" } });
      assert.equal(saved.writes.at(-1).pending, true); assert.equal(JSON.parse(options.body).chat_id, chatId); sends++;
      return Response.json({ ok: true, result: { message_id: sends, chat: { id: Number(chatId) } } });
    };
    const run = () => core.runMonitor({ site: "https://leadly-topaz-seven.vercel.app", token, chatId, loadState: () => saved.get(), saveState: s => saved.put("state", s), fetcher, now, delay: async () => {} });
    assert.equal((await run()).notification, "sent"); assert.equal((await run()).notification, "none");
    status = "ok"; assert.equal((await run()).notification, "sent"); assert.equal((await run()).notification, "none");
    assert.equal(sends, 2); assert.equal(checks, 6);
  });
  await test("missing credentials and corrupt durable state fail without leaking values", async () => {
    const object = new OwnerMonitor({ storage: storage() }, {});
    assert.deepEqual(await (await object.fetch(request())).json(), { error: "owner_monitor_failed" });
    const corrupt = new OwnerMonitor({ storage: storage({ privateValue: token }) }, { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId });
    assert.deepEqual(await (await corrupt.fetch(request())).json(), { error: "owner_monitor_failed" });
  });
  await test('a cold object reads real-shaped GitHub metadata and stores backup evidence without Telegram', async () => {
    const saved = storage(), original = global.fetch, fixture = backupFixture();
    await saved.put('backupCache', undefined); let github = 0, telegram = 0;
    try {
      global.fetch = async url => {
        if (url.endsWith('/api/status')) return Response.json({ status: 'ok', checkedAt: new Date().toISOString() });
        if (url.startsWith('https://api.github.com/')) { github++; return Response.json(fixturePayload(url, [fixture])); }
        telegram++; throw Error('unexpected_telegram_request');
      };
      const object = new OwnerMonitor({ storage: saved }, { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId });
      const result = await (await object.fetch(request())).json();
      assert.equal(result.status, 'ok'); assert.equal(result.backup, 'ok');
      assert.equal(github, 3); assert.equal(telegram, 0);
      const restarted = new OwnerMonitor({ storage: saved }, { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId });
      assert.equal((await (await restarted.fetch(request())).json()).backup, 'ok');
      assert.equal(github, 3);
    } finally { global.fetch = original; }
  });
  await test('a new release refreshes backup evidence while retaining pending delivery suppression', async () => {
    const initial = { ...valid(), lastStatus: 'unavailable', noticeStatus: 'unavailable',
      lastAttemptAt: Date.now(), pending: true };
    const saved = storage(initial), original = global.fetch, fixture = backupFixture();
    await saved.put('backupReleaseId', 'release-old'); let github = 0, telegram = 0;
    try {
      global.fetch = async url => {
        if (url.endsWith('/api/status')) return Response.json({ status: 'ok', checkedAt: new Date().toISOString() });
        if (url.startsWith('https://api.github.com/')) { github++; return Response.json(fixturePayload(url, [fixture])); }
        telegram++; throw Error('must_not_repeat_delivery');
      };
      const env = { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId, MONITOR_RELEASE_ID: 'release-new' };
      assert.equal((await (await new OwnerMonitor({ storage: saved }, env).fetch(request())).json()).notification, 'none');
      assert.equal(await saved.get('backupReleaseId'), 'release-new');
      assert.equal((await saved.get('state')).retryAfter, initial.lastAttemptAt + 6 * 3600000);
      assert.equal(github, 3); assert.equal(telegram, 0);
      await new OwnerMonitor({ storage: saved }, env).fetch(request()); assert.equal(github, 3);
    } finally { global.fetch = original; }
  });
  await test('an update preserves a provider rate-limit pause and exposes only bounded diagnostics', async () => {
    const now = Date.now(), saved = storage({ ...valid(), lastStatus: 'unavailable',
      noticeStatus: 'unavailable', lastAttemptAt: now, pending: true });
    const limited = { ...backupFixture().cache, checkedAt: now, verifiedAt: 0,
      nextCheckAt: now + 3600000, snapshot: null, latest: null, error: 'rate_limited' };
    await saved.put('backupCache', limited); await saved.put('backupReleaseId', 'release-old');
    const original = global.fetch, originalTimeout = global.setTimeout; let sites = 0;
    try {
      global.setTimeout = (callback, ms, ...args) => originalTimeout(callback, ms === 10000 ? 0 : ms, ...args);
      global.fetch = async url => {
        assert(url.endsWith('/api/status')); sites++;
        return Response.json({ status: 'ok', checkedAt: new Date(now).toISOString() });
      };
      const env = { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId, MONITOR_RELEASE_ID: 'release-new' };
      const result = await (await new OwnerMonitor({ storage: saved }, env).fetch(request())).json();
      assert.equal(result.backup, 'unavailable'); assert.equal(result.backupError, 'rate_limited');
      assert.equal(result.backupNextCheckAt, limited.nextCheckAt); assert.equal(result.notification, 'none');
      assert.equal(sites, 2); assert.equal((await saved.get('backupCache')).nextCheckAt, limited.nextCheckAt);
      assert(!JSON.stringify(result).includes(token)); assert(!JSON.stringify(result).includes(chatId));
    } finally { global.fetch = original; global.setTimeout = originalTimeout; }
  });
  await test('switching to the authenticated quota refreshes anonymous evidence without exposing the token', async () => {
    const now = Date.now(), githubToken = 'github_pat_fixture_read_only';
    const saved = storage({ ...valid(), lastStatus: 'unavailable', noticeStatus: 'unavailable', lastAttemptAt: now, pending: true });
    await saved.put('backupCache', { ...backupFixture().cache, checkedAt: now, verifiedAt: 0,
      nextCheckAt: now + 3600000, snapshot: null, latest: null, error: 'rate_limited' });
    await saved.put('backupReleaseId', 'release-same'); await saved.put('backupAccess', 'public');
    const original = global.fetch, fixture = backupFixture(); let github = 0;
    try {
      global.fetch = async (url, options) => {
        if (url.endsWith('/api/status')) { assert(!options.headers?.Authorization); return Response.json({ status: 'ok', checkedAt: new Date().toISOString() }); }
        assert(url.startsWith('https://api.github.com/')); github++;
        assert.equal(options.headers.Authorization, 'Bearer ' + githubToken);
        return Response.json(fixturePayload(url, [fixture]));
      };
      const env = { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId, MONITOR_RELEASE_ID: 'release-same', LEADLY_MONITOR_GITHUB_TOKEN: githubToken };
      const result = await (await new OwnerMonitor({ storage: saved }, env).fetch(request())).json();
      assert.equal(result.backup, 'ok'); assert.equal(result.backupAccess, 'token'); assert.equal(result.notification, 'none');
      assert.equal(github, 3); assert.equal(await saved.get('backupAccess'), 'token');
      await new OwnerMonitor({ storage: saved }, env).fetch(request()); assert.equal(github, 3);
      assert(!JSON.stringify(await saved.get('backupCache')).includes(githubToken)); assert(!JSON.stringify(result).includes(githubToken));
    } finally { global.fetch = original; }
  });
  console.log("RESULT " + count + " Cloudflare monitor checks");
})().catch(error => { console.error(error); process.exitCode = 1; });
