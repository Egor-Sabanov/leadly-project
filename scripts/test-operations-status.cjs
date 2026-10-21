const assert = require('node:assert/strict');
const path = require('node:path');
const { operationsStatus } = require('./ts-loader.cjs').createTsLoader()(path.join(__dirname, '../lib/operations-status.ts'));
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
  console.log('RESULT ' + n + ' public operations status checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
