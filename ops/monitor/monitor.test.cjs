const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { monitor, probe, siteOrigin } = require('./monitor.cjs');
const token = '123456:fixture-token-with-at-least-20-characters', chatId = '123456789';
const base = 'https://leadly-topaz-seven.vercel.app';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leadly-monitor-'));
const now = Date.parse('2026-10-21T12:00:00Z');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
function fixture(state = 'ok', overrides = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options }); assert.equal(options.redirect, 'manual');
    if (url.endsWith('/api/status')) return overrides.probe ? overrides.probe() : Response.json({ status: state, checkedAt: new Date(now).toISOString(), ignoredPrivateValue: 'never-copy-me' }, { status: state === 'ok' ? 200 : 503 });
    if (url.endsWith('/getMe')) return Response.json({ ok: true, result: { id: 123456, is_bot: true, username: overrides.username || 'leadly_work_bot' } });
    assert(url.endsWith('/sendMessage'));
    const body = JSON.parse(options.body); assert.equal(body.chat_id, chatId); assert(!body.text.includes('never-copy-me'));
    return overrides.send ? overrides.send() : Response.json({ ok: true, result: { message_id: 1, chat: { id: Number(chatId) } } });
  };
  return { fetcher, calls };
}
async function run(file, f, extra = {}) { return monitor({ site: base, token, chatId, file, fetcher: f.fetcher, now, delay: async () => {}, ...extra }); }
(async () => { try {
  await test('only canonical HTTPS production origins are accepted', () => {
    assert.equal(siteOrigin(base), base);
    for (const value of ['http://localhost', 'https://127.0.0.1', base + '/auth', base + '?token=x', 'https://user:secret@leadly-topaz-seven.vercel.app']) assert.throws(() => siteOrigin(value));
  });
  await test('healthy bootstrap stores state without sending a message', async () => {
    const f = fixture(); assert.deepEqual(await run(path.join(root, 'healthy'), f), { status: 'ok', notification: 'none' }); assert.equal(f.calls.length, 1);
  });
  await test('transient failure recovers on confirmation without alerting', async () => {
    let n = 0; const f = fixture('ok', { probe: () => ++n === 1 ? new Response('down', { status: 502 }) : Response.json({ status: 'ok', checkedAt: new Date(now).toISOString() }) });
    assert.equal((await run(path.join(root, 'transient'), f)).notification, 'none'); assert.equal(f.calls.length, 2);
  });
  await test('confirmed failure alerts once, then one recovery message', async () => {
    const file = path.join(root, 'transition'); const bad = fixture('degraded'); assert.equal((await run(file, bad)).notification, 'sent');
    assert.equal((await run(file, fixture('degraded'), { now: now + 60000 })).notification, 'none');
    const good = fixture(); assert.equal((await run(file, good, { now: now + 60000 })).notification, 'sent'); assert.equal((await run(file, good, { now: now + 60000 })).notification, 'none');
  });
  await test('state is persisted before sending and ambiguous transport is not repeated immediately', async () => {
    const file = path.join(root, 'ambiguous'); const f = fixture('unavailable', { send: () => { assert.equal(JSON.parse(fs.readFileSync(file)).pending, true); throw new Error('network'); } });
    assert.equal((await run(file, f)).notification, 'uncertain'); const next = fixture('unavailable'); assert.equal((await run(file, next, { now: now + 60000 })).notification, 'none'); assert(!next.calls.some(c => c.url.endsWith('/sendMessage')));
  });
  await test('Telegram rate limit persists across runs and retries only after its pause', async () => {
    const file = path.join(root, 'limited'); const f = fixture('degraded', { send: () => Response.json({ ok: false, error_code: 429, parameters: { retry_after: 120 } }, { status: 429 }) });
    assert.equal((await run(file, f)).notification, 'rate_limited'); assert.equal((await run(file, fixture('degraded'), { now: now + 60000 })).notification, 'none');
    const fresh = fixture('degraded', { probe: () => Response.json({ status: 'degraded', checkedAt: new Date(now + 121000).toISOString() }, { status: 503 }) });
    assert.equal((await run(file, fresh, { now: now + 121000 })).notification, 'sent');
  });
  await test('a killed send is suppressed on the next runner', async () => {
    const file = path.join(root, 'killed'); fs.writeFileSync(file, JSON.stringify({ version: 1, lastStatus: 'degraded', noticeStatus: 'degraded', lastAttemptAt: now, retryAfter: 0, pending: true }));
    assert.equal((await run(file, fixture('degraded'), { now: now + 60000 })).notification, 'none');
  });
  await test('recovery and setup tests respect even a Telegram pause longer than one day', async () => {
    const file = path.join(root, 'long-limit');
    await run(file, fixture('degraded'));
    const limited = fixture('ok', { send: () => Response.json({ ok: false, error_code: 429, parameters: { retry_after: 172800 } }, { status: 429 }) });
    assert.equal((await run(file, limited, { now: now + 60000 })).notification, 'rate_limited');
    assert.equal(JSON.parse(fs.readFileSync(file)).retryAfter, now + 60000 + 172800000);
    assert.equal((await run(file, fixture('ok'), { now: now + 120000, test: true })).notification, 'none');
  });
  await test('wrong bot token is never used for an outbound alert', async () => {
    const f = fixture('degraded', { username: 'another_bot' }); assert.equal((await run(path.join(root, 'bot'), f)).notification, 'verification_failed'); assert(!f.calls.some(c => c.url.endsWith('/sendMessage')));
  });
  await test('stale or malformed status and redirects are failures, never a false recovery', async () => {
    for (const response of [() => Response.json({ status: 'ok', checkedAt: new Date(now - 300000).toISOString() }), () => Response.json({ status: 'ok', checkedAt: new Date(now).toISOString() }, { status: 503 }), () => new Response('x'.repeat(17000)), () => Response.json({ status: 'ok', checkedAt: new Date(now + 120000).toISOString() })]) assert.equal(await probe(base, fixture('ok', { probe: response }).fetcher, now), 'unavailable');
  });
  await test('corrupt or symlinked state fails closed instead of sending duplicates', async () => {
    const file = path.join(root, 'corrupt'); fs.writeFileSync(file, '{'); await assert.rejects(() => run(file, fixture('degraded')));
    fs.symlinkSync(file, path.join(root, 'link')); await assert.rejects(() => run(path.join(root, 'link'), fixture('degraded')));
  });
  await test('explicit test uses the verified bot and a private bounded state file', async () => {
    const file = path.join(root, 'test'); assert.equal((await run(file, fixture(), { test: true })).notification, 'sent'); assert.equal(fs.statSync(file).mode & 0o777, 0o600); assert(!fs.readFileSync(file, 'utf8').includes(token));
  });
  console.log('RESULT ' + count + ' independent monitor checks');
} finally { fs.rmSync(root, { recursive: true, force: true }); } })().catch(e => { console.error(e); process.exitCode = 1; });
