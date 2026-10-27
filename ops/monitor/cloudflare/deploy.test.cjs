const assert = require("node:assert/strict");
const fs = require("node:fs");
const { deploy } = require("./deploy.cjs");
const account = "a".repeat(32);
const env = { CLOUDFLARE_API_TOKEN: "fixture-cloudflare", TELEGRAM_BOT_TOKEN: "fixture-bot", TELEGRAM_CHAT_ID: "123456789" };
function fixture(existing = false, accounts = [{ id: account }]) {
  const calls = [], cli = [];
  return { calls, cli, fetcher: async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer " + env.CLOUDFLARE_API_TOKEN); assert.equal(options.redirect, "manual"); calls.push(url);
    return url.includes("/schedules") ? (existing ? Response.json({ success: true, result: [] }) : new Response(null, { status: 404 })) : Response.json({ success: true, result: accounts });
  }, execute: async (args, input) => { cli.push({ args, input, config: args[0] === "deploy" ? JSON.parse(fs.readFileSync(args[args.indexOf("--config") + 1], "utf8")) : null }); } };
}
(async () => {
  const fresh = fixture(); const result = await deploy({ env, ...fresh, testId: "activation-123" });
  assert.equal(result.naturalExecutionVerified, false); assert.equal(fresh.cli.length, 3);
  assert.deepEqual(fresh.cli[0].config.triggers.crons, []); assert.deepEqual(fresh.cli[2].config.triggers.crons, ["*/5 * * * *"]);
  assert.equal(fresh.cli[1].args[0], "secret"); assert.deepEqual(JSON.parse(fresh.cli[1].input), { TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID });
  assert(!JSON.stringify(fresh.cli.map(x => x.args)).includes(env.TELEGRAM_BOT_TOKEN)); assert(!fs.existsSync(fresh.cli[0].args[2]));
  assert(fresh.cli[2].args.some(value => /^MONITOR_RELEASE_ID:release-\d+$/.test(value)));
  const existing = fixture(true); await deploy({ env, ...existing }); assert.equal(existing.cli.length, 2); assert.equal(existing.cli[0].args[0], "secret");
  const ambiguous = fixture(false, [{ id: account }, { id: "b".repeat(32) }]); await assert.rejects(() => deploy({ env, ...ambiguous }), /cloudflare_account_must_be_explicit/); assert.equal(ambiguous.cli.length, 0);
  const denied = fixture(); denied.fetcher = async () => new Response(null, { status: 403 }); await assert.rejects(() => deploy({ env, ...denied }), /cloudflare_account_or_worker_read_failed/); assert.equal(denied.cli.length, 0);
  const failedSecret = fixture(true); failedSecret.execute = async (args) => { assert.equal(args[0], "secret"); throw new Error("fixture_secret_failure"); };
  await assert.rejects(() => deploy({ env, ...failedSecret }), /fixture_secret_failure/);
  await assert.rejects(() => deploy({ env: {}, ...fixture() }), /monitor_deploy_secrets_missing/);
  await assert.rejects(() => deploy({ env, ...fixture(), testId: "bad id" }), /invalid_setup_test_id/);
  const release = fixture(true); await deploy({ env: { ...env, MONITOR_RELEASE_ID: 'release-123-1' }, ...release });
  assert(release.cli.at(-1).args.includes('MONITOR_RELEASE_ID:release-123-1'));
  await assert.rejects(() => deploy({ env: { ...env, MONITOR_RELEASE_ID: 'invalid id' }, ...fixture() }), /invalid_monitor_release_id/);
  console.log("RESULT 8 Cloudflare deployment checks; no real outbound requests");
})().catch(error => { console.error(error); process.exitCode = 1; });
