const assert = require('node:assert/strict');
const { probeBackup, evaluate, cacheState, monitorCheck, maxAgeMs, refreshMs, verificationGraceMs } = require('./backup.cjs');
const { runMonitor, validateState } = require('./core.cjs');
const { backupFixture, fixturePayload } = require('./backup.fixture.cjs');
const now = Date.parse('2026-10-27T12:00:00Z');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
function scenario(fixtures = [backupFixture(now)], initial = null) {
  let cache = initial;
  const calls = [], writes = [];
  const options = { now, loadCache: async () => structuredClone(cache),
    saveCache: async value => { cache = structuredClone(value); writes.push(cache); },
    fetcher: async (url, init) => {
      calls.push(url);
      assert(url.startsWith('https://api.github.com/repos/Egor-Sabanov/leadly-project/actions/'));
      assert.equal(init.redirect, 'manual'); assert(!('Authorization' in init.headers));
      return Response.json(fixturePayload(url, fixtures));
    } };
  return { calls, writes, options, cache: () => cache, run: extra => probeBackup({ ...options, ...extra }) };
}

(async () => {
  await test('a backup requires the expected encrypted artifact and successful snapshot and upload steps', async () => {
    const s = scenario(); const result = await s.run();
    assert.equal(result.status, 'ok'); assert.equal(result.snapshotAt, now - 3600000);
    assert.equal(s.calls.length, 3); assert.equal(s.writes.length, 1);
    assert(!JSON.stringify(s.cache()).includes('https://'));
  });
  await test('snapshot age uses the start of data collection rather than archive upload time', async () => {
    const fixture = backupFixture(now, { age: maxAgeMs + 1000 });
    fixture.artifact.created_at = new Date(now - 10000).toISOString();
    assert.equal((await scenario([fixture]).run()).status, 'stale');
  });
  await test('the age threshold advances during the metadata cache interval', async () => {
    const fixture = backupFixture(now, { age: maxAgeMs - 1000 }); const s = scenario([fixture]);
    assert.equal((await s.run()).status, 'ok');
    assert.equal((await s.run({ now: now + 2000 })).status, 'stale'); assert.equal(s.calls.length, 6);
    assert.equal((await s.run({ now: now + 3000 })).status, 'stale'); assert.equal(s.calls.length, 6);
  });
  await test('crossing the age deadline refreshes evidence before warning about an archive already replaced', async () => {
    const fixtures = [backupFixture(now, { age: maxAgeMs - 1000 })], s = scenario(fixtures);
    assert.equal((await s.run()).status, 'ok');
    fixtures[0] = backupFixture(now + 2000, { id: 1002 });
    assert.equal((await s.run({ now: now + 2000 })).status, 'ok'); assert.equal(s.calls.length, 6);
  });
  await test('metadata cache survives a process restart and refreshes after fifteen minutes', async () => {
    const first = scenario(); await first.run();
    const second = scenario([backupFixture(now)], first.cache());
    assert.equal((await second.run({ now: now + 1000 })).status, 'ok'); assert.equal(second.calls.length, 0);
    await second.run({ now: now + refreshMs }); assert.equal(second.calls.length, 3);
  });
  await test('a successful workflow without an artifact is never healthy', async () => {
    const fixture = backupFixture(now); fixture.artifact = null;
    assert.equal((await scenario([fixture]).run()).status, 'missing');
  });
  await test('a missing newest archive warns even when an older valid archive exists', async () => {
    const latest = backupFixture(now); latest.artifact = null;
    const older = backupFixture(now, { id: 1000, age: 12 * 3600000 });
    const result = await scenario([latest, older]).run();
    assert.equal(result.status, 'missing'); assert.equal(result.artifactId, older.artifact.id);
  });
  await test('failed, cancelled and skipped backups warn while preserving the previous snapshot context', async () => {
    for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out']) {
      const latest = backupFixture(now); latest.run.conclusion = conclusion;
      const older = backupFixture(now, { id: 1000, age: 12 * 3600000 });
      const result = await scenario([latest, older]).run();
      assert.equal(result.status, 'failed'); assert.equal(result.artifactId, older.artifact.id);
    }
  });
  await test('queued jobs use the previous valid copy and warn after an hour', async () => {
    const latest = backupFixture(now); latest.run.status = 'queued'; latest.run.conclusion = null;
    const older = backupFixture(now, { id: 1000, age: 12 * 3600000 });
    const s = scenario([latest, older]); assert.equal((await s.run()).status, 'stalled');
    latest.run.created_at = latest.run.run_started_at = new Date(now - 1000).toISOString();
    assert.equal((await scenario([latest, older]).run()).status, 'ok');
  });
  await test('an artifact deleted after a successful poll is detected on the next refresh', async () => {
    const fixture = backupFixture(now); const s = scenario([fixture]); await s.run();
    fixture.artifact = null;
    assert.equal((await s.run({ now: now + refreshMs })).status, 'missing');
  });
  await test('expired, plaintext and incorrectly named artifacts cannot establish backup health', async () => {
    for (const change of [f => f.artifact.expired = true,
      f => f.artifact.name = 'leadly.tar', f => f.artifact.size_in_bytes = 0,
      f => f.artifact.expires_at = new Date(now - 1).toISOString()]) {
      const fixture = backupFixture(now); change(fixture);
      assert.notEqual((await scenario([fixture]).run()).status, 'ok');
    }
  });
  await test('foreign run, branch and commit metadata are rejected', async () => {
    for (const change of [f => f.artifact.workflow_run.id++, f => f.artifact.workflow_run.head_branch = 'other',
      f => f.artifact.workflow_run.head_sha = 'b'.repeat(40), f => f.run.repository.full_name = 'other/repo',
      f => f.run.head_branch = 'other', f => f.run.id = '1001']) {
      const fixture = backupFixture(now); change(fixture);
      assert.notEqual((await scenario([fixture]).run()).status, 'ok');
    }
  });
  await test('a rerun cannot reuse an archive from before its snapshot step', async () => {
    const fixture = backupFixture(now); fixture.run.run_attempt = 2;
    fixture.job.steps[0].started_at = new Date(now - 500).toISOString();
    fixture.job.steps[0].completed_at = new Date(now - 100).toISOString();
    assert.equal((await scenario([fixture]).run()).status, 'unverified');
  });
  await test('successful steps are required even when the workflow and artifact exist', async () => {
    for (const change of [f => f.job.conclusion = 'skipped', f => f.job.steps[0].conclusion = 'failure',
      f => f.job.steps[1].conclusion = 'skipped', f => f.job.steps = [], f => f.job.run_id++]) {
      const fixture = backupFixture(now); change(fixture);
      assert.equal((await scenario([fixture]).run()).status, 'unverified');
    }
  });
  await test('future timestamps and malformed cache cannot create indefinitely fresh evidence', async () => {
    const fixture = backupFixture(now); fixture.run.created_at = new Date(now + 120000).toISOString();
    assert.equal((await scenario([fixture]).run()).status, 'unavailable');
    const cache = backupFixture(now + 3600000).cache; const s = scenario([], cache);
    s.options.fetcher = async () => new Response(null, { status: 503 });
    assert.equal((await s.run()).status, 'unavailable');
    assert.deepEqual(cacheState({ version: 1, privateToken: 'fixture' }).snapshot, null);
  });
  await test('temporary GitHub failure keeps recently verified evidence but becomes an alert after one hour', async () => {
    const cache = backupFixture(now).cache; cache.checkedAt = now - refreshMs; cache.nextCheckAt = now;
    const s = scenario([], cache); s.options.fetcher = async () => new Response(null, { status: 503 });
    assert.equal((await s.run()).status, 'ok');
    assert.equal((await s.run({ now: now + verificationGraceMs })).status, 'unavailable');
  });
  await test('provider rate-limit pauses survive restarts without more GitHub requests', async () => {
    const s = scenario(); let attempts = 0;
    s.options.fetcher = async () => { attempts++; return new Response(null, { status: 429, headers: { 'retry-after': '7200' } }); };
    const first = await s.run(); assert.equal(first.status, 'unavailable');
    assert.equal(first.nextCheckAt, now + 7200000);
    await s.run({ now: now + 3600000 }); assert.equal(attempts, 1);
  });
  await test('redirects and oversized provider replies fail closed without following supplied URLs', async () => {
    for (const response of [new Response(null, { status: 302, headers: { location: 'https://other.example' } }),
      new Response('x'.repeat(256 * 1024 + 1))]) {
      const s = scenario(); s.options.fetcher = async () => response;
      assert.equal((await s.run()).status, 'unavailable');
    }
  });
  await test('failed cache persistence prevents the check from claiming a durable result', async () => {
    const s = scenario(); await assert.rejects(s.run({ saveCache: async () => { throw new Error('fixture_storage_failure'); } }), /fixture_storage_failure/);
  });
  await test('healthy website cannot conceal stale backups and recovery text requires both components', async () => {
    const stale = monitorCheck('ok', { status: 'stale', snapshotAt: now - 25 * 3600000 }, now);
    assert.equal(stale.status, 'degraded'); assert.match(stale.text, /старше 24 часов/);
    assert.match(stale.text, /25 ч 0 мин/);
    assert.equal(monitorCheck('unavailable', { status: 'ok' }, now).status, 'unavailable');
    assert.equal(monitorCheck('ok', { status: 'ok' }, now).status, 'ok');
  });
  await test('legacy persisted notification state migrates without losing ambiguous delivery suppression', async () => {
    let state = { version: 1, lastStatus: 'unavailable', noticeStatus: 'unavailable', lastAttemptAt: now, retryAfter: 0, pending: true };
    const result = await runMonitor({ site: 'https://leadly-topaz-seven.vercel.app', token: '123456:fixture-token-with-at-least-20-characters', chatId: '123456789',
      loadState: async () => state, saveState: async value => state = value, now, delay: async () => {},
      check: async () => monitorCheck('ok', { status: 'stale', snapshotAt: now - 25 * 3600000 }, now),
      fetcher: async () => { throw Error('must_not_send'); } });
    assert.equal(result.notification, 'none'); assert.equal(state.retryAfter, now + 6 * 3600000);
    assert.equal(validateState(state).pending, false);
  });
  await test('adding healthy backup checks does not repeat a recently reported legacy site incident', async () => {
    for (const status of ['degraded', 'unavailable']) {
      let state = { version: 1, lastStatus: status, noticeStatus: status, lastAttemptAt: now, retryAfter: 0, pending: false };
      const result = await runMonitor({ site: 'https://leadly-topaz-seven.vercel.app', token: '123456:fixture-token-with-at-least-20-characters', chatId: '123456789',
        loadState: async () => state, saveState: async value => state = value, now, delay: async () => {},
        check: async () => monitorCheck(status, { status: 'ok' }, now),
        fetcher: async () => { throw Error('must_not_repeat'); } });
      assert.equal(result.notification, 'none');
    }
  });
  await test('one incident, partial recovery and full recovery share a single durable notification stream', async () => {
    let state, site = 'ok', backup = 'stale', sends = 0;
    const options = { site: 'https://leadly-topaz-seven.vercel.app', token: '123456:fixture-token-with-at-least-20-characters', chatId: '123456789',
      loadState: async () => state, saveState: async value => state = structuredClone(value), now, delay: async () => {},
      check: async () => monitorCheck(site, { status: backup, snapshotAt: now - 25 * 3600000 }, now),
      fetcher: async (url, init) => {
        if (url.endsWith('/getMe')) return Response.json({ ok: true, result: { id: 123456, is_bot: true, username: 'leadly_work_bot' } });
        assert(state.pending); assert.equal(JSON.parse(init.body).chat_id, '123456789'); sends++;
        return Response.json({ ok: true, result: { message_id: sends, chat: { id: 123456789 } } });
      } };
    assert.equal((await runMonitor(options)).notification, 'sent');
    assert.equal((await runMonitor(options)).notification, 'none');
    site = 'unavailable'; assert.equal((await runMonitor(options)).notification, 'sent');
    site = 'ok'; assert.equal((await runMonitor(options)).notification, 'sent');
    backup = 'ok'; assert.equal((await runMonitor(options)).notification, 'sent');
    assert.equal((await runMonitor(options)).notification, 'none'); assert.equal(sends, 4);
  });
  await test('a composite warning respects Telegram retry_after and restores its previous incident key', async () => {
    let state; let time = now, rateLimited = true, sends = 0;
    const run = () => runMonitor({ site: 'https://leadly-topaz-seven.vercel.app', token: '123456:fixture-token-with-at-least-20-characters', chatId: '123456789',
      loadState: async () => state, saveState: async value => state = structuredClone(value), now: time, delay: async () => {},
      check: async () => monitorCheck('ok', { status: 'stale', snapshotAt: now - 25 * 3600000 }, time),
      fetcher: async url => {
        if (url.endsWith('/getMe')) return Response.json({ ok: true, result: { id: 123456, is_bot: true, username: 'leadly_work_bot' } });
        sends++; return rateLimited ? Response.json({ ok: false, error_code: 429, parameters: { retry_after: 3600 } }, { status: 429 })
          : Response.json({ ok: true, result: { message_id: 1, chat: { id: 123456789 } } });
      } });
    assert.equal((await run()).notification, 'rate_limited'); assert.equal(state.noticeStatus, null);
    time += 1000; assert.equal((await run()).notification, 'none'); assert.equal(sends, 1);
    time = now + 3600000; rateLimited = false; assert.equal((await run()).notification, 'sent');
    assert.equal((await run()).notification, 'none'); assert.equal(sends, 2);
  });
  console.log('RESULT ' + count + ' backup freshness checks; no real outbound requests');
})().catch(error => { console.error(error); process.exitCode = 1; });
