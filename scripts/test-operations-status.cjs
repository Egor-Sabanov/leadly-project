const assert = require('node:assert/strict');
const path = require('node:path');
const { operationsStatus } = require('./ts-loader.cjs').createTsLoader()(path.join(__dirname, '../lib/operations-status.ts'));
const { freshSnapshot } = require('./ts-loader.cjs').createTsLoader()(path.join(__dirname, '../lib/fresh-snapshot.ts'));
const now = Date.parse('2026-10-21T12:00:00Z');
const row = { status: 'completed', started_at: new Date(now - 60000).toISOString(), finished_at: new Date(now - 30000).toISOString() };
const fixture = (rows = [row], scheduler = { enabled: true, schedule: '*/10 * * * *' }, error = null) => ({
  from: table => { assert.equal(table, 'leadly_runtime_runs'); return { select: columns => { assert.equal(columns, 'started_at,finished_at,status'); return { order: () => ({ limit: async () => ({ data: rows, error }) }) }; } }; },
  rpc: async name => { assert.equal(name, 'leadly_scheduler_status'); return { data: scheduler, error }; },
});
(async () => { let n = 0; const test = async (name, fn) => { await fn(); n++; console.log('PASS ' + name); };
  await test('public status reports fresh complete runs without private metadata', async () => { const r = await operationsStatus(fixture(), true, now); assert.equal(r.status, 'ok'); assert.deepEqual(Object.keys(r).sort(), ['checkedAt', 'status']); });
  await test('stopped or changed ten-minute schedule is degraded', async () => { for (const s of [{ enabled: false }, { enabled: true, schedule: '* * * * *' }]) assert.equal((await operationsStatus(fixture([row], s), true, now)).status, 'degraded'); });
  await test('partial source import and stale success cannot appear healthy', async () => { for (const rows of [[{ ...row, status: 'partial' }, row], [{ ...row, finished_at: new Date(now - 36 * 60000).toISOString() }], []]) assert.equal((await operationsStatus(fixture(rows), true, now)).status, 'degraded'); });
  await test('Auth or database failure exposes only unavailable', async () => { assert.equal((await operationsStatus(fixture(), false, now)).status, 'unavailable'); const r = await operationsStatus(fixture([row], null, { message: 'private database error' }), true, now); assert.equal(r.status, 'unavailable'); assert(!JSON.stringify(r).includes('private')); });
  await test('network rejection fails closed with a stable public shape', async () => { const r = await operationsStatus({ from() { throw new Error('private credential'); } }, true, now); assert.equal(r.status, 'unavailable'); assert.equal(Object.keys(r).length, 2); });
  await test('the first health request after an idle period waits for a fresh snapshot', async () => {
    let time = now, calls = 0; const get = freshSnapshot(async () => ({ checkedAt: time, calls: ++calls }), 30000, () => time);
    const first = await get(); time += 10000; assert.deepEqual(await get(), first);
    time += 5 * 60000; const next = await get(); assert.equal(next.checkedAt, time); assert.equal(next.calls, 2);
  });
  await test('concurrent health checks share one refresh instead of serving stale data', async () => {
    let time = now, release, calls = 0; const get = freshSnapshot(async () => { calls++; await new Promise(resolve => { release = resolve; }); return time; }, 30000, () => time);
    const a = get(), b = get(); await Promise.resolve(); assert.equal(calls, 1); release(); assert.deepEqual(await Promise.all([a, b]), [time, time]);
    time += 60000; const c = get(); let done = false; c.then(() => { done = true; }); await Promise.resolve(); assert.equal(calls, 2); assert.equal(done, false); release(); assert.equal(await c, time);
  });
  await test('a failed refresh is retried and a backwards clock cannot retain an old snapshot', async () => {
    let time = now, fail = true, calls = 0; const get = freshSnapshot(async () => { calls++; if (fail) throw Error('private fixture error'); return time; }, 30000, () => time);
    await assert.rejects(get); fail = false; assert.equal(await get(), time); assert.equal(calls, 2);
    time -= 60000; assert.equal(await get(), time); assert.equal(calls, 3);
  });
  console.log('RESULT ' + n + ' public operations status checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
