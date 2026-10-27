const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { observe, naturalEvidence, jsonEvents } = require('./observe.cjs');
const now = Date.parse('2026-10-27T12:00:00Z');
const report = () => ({ status: 'ok', site: 'ok', backup: 'ok', notification: 'none',
  snapshotAt: now - 3600000, backupVerifiedAt: now - 1000, backupVerification: 'live' });
const event = value => ({ outcome: 'ok', logs: [{ level: 'log', message: [JSON.stringify(value)] }] });
const options = { accountId: 'a'.repeat(32), since: now - 2000, now: () => now,
  env: { CLOUDFLARE_API_TOKEN: 'fixture-cloudflare-private', LEADLY_WRANGLER_BIN: '/fixture/wrangler.js' } };
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
function childFixture(send) {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.killed = false; child.kill = () => { child.killed = true; };
  setImmediate(() => send(child)); return child;
}
(async () => {
  await test('natural verification requires backup evidence collected after publication', () => {
    assert(naturalEvidence(event(report()), { since: options.since, now }));
    for (const change of [r => r.backup = 'unavailable', r => r.backupVerifiedAt = options.since - 1,
      r => r.snapshotAt = now - 25 * 3600000, r => r.snapshotAt = now + 120000,
      r => r.notification = 'verification_failed', r => delete r.backupVerification]) {
      const value = report(); change(value);
      assert.equal(naturalEvidence(event(value), { since: options.since, now }), null);
    }
  });
  await test('a genuine site incident is reported separately from a healthy backup probe', () => {
    const value = { ...report(), status: 'degraded', site: 'degraded', notification: 'sent' };
    assert.equal(naturalEvidence(event(value), { since: options.since, now }).siteStatus, 'degraded');
  });
  await test('the JSON stream handles pretty events, split strings and consecutive objects', () => {
    const seen = [], consume = jsonEvents(value => seen.push(value));
    const text = JSON.stringify({ logs: [{ message: ['{"text":"} escaped \\\" {"}'] }] }, null, 2);
    for (const char of 'banner\n' + text + '\n' + JSON.stringify(event(report()))) consume(char);
    assert.equal(seen.length, 2); assert.deepEqual(seen[1], event(report()));
  });
  await test('the tail uses only the selected account and returns a bounded safe proof', async () => {
    let child;
    const result = await observe({ ...options, timeoutMs: 1000,
      startTail: (args, settings) => {
        assert(args.includes('leadly-owner-monitor')); assert(args.includes('json'));
        // No sampling filter means all events; pinned Wrangler rejects rate 1.
        assert(!args.includes('--sampling-rate'));
        assert.equal(settings.env.CLOUDFLARE_ACCOUNT_ID, options.accountId);
        assert(!args.includes(options.env.CLOUDFLARE_API_TOKEN));
        return child = childFixture(instance => instance.stdout.emit('data', JSON.stringify(event(report()), null, 2)));
      } });
    assert(result.naturalExecutionVerified); assert(child.killed);
    assert(!JSON.stringify(result).includes(options.env.CLOUDFLARE_API_TOKEN));
  });
  await test('a closed tail cannot claim that a natural run was observed', async () => {
    await assert.rejects(observe({ ...options, startTail: () => childFixture(child => child.emit('close', 1)) }),
      /monitor_tail_ended_before_verification/);
  });
  await test('missing evidence times out without exposing stderr or sending notifications', async () => {
    await assert.rejects(observe({ ...options, timeoutMs: 20,
      startTail: () => childFixture(child => child.stderr.emit('data', options.env.CLOUDFLARE_API_TOKEN)) }),
      /natural_monitor_observation_timeout/);
    await assert.rejects(observe({ ...options, accountId: 'other' }), /monitor_observe_not_configured/);
  });
  console.log('RESULT ' + count + ' natural monitor observation checks; no real outbound requests');
})().catch(error => { console.error(error); process.exitCode = 1; });
