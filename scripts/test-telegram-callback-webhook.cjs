const assert = require('node:assert/strict'), path = require('node:path');
const { createTsLoader } = require('./ts-loader.cjs');
const plain = createTsLoader();
const secret = 's'.repeat(64), token = '123456:' + 'fixture_token_'.repeat(3), site = 'https://leadly.example';
function harness(options = {}) {
  const calls = [];
  const load = createTsLoader({ Buffer, process: { env: { TELEGRAM_WEBHOOK_SECRET: secret, TELEGRAM_BOT_TOKEN: token, TELEGRAM_BOT_USERNAME: 'leadly_work_bot', LEADLY_SITE_URL: site, NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only', ...options.env } },
    require(id) {
      if (id === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      if (id === '@/lib/request-guards') return plain(path.join(__dirname, '../lib/request-guards.ts'));
      if (id === '@/lib/telegram-server') return { telegramAdmin: () => { calls.push('database'); return {}; }, telegramHeaders: { 'Cache-Control': 'private, no-store' } };
      if (id === '@/lib/telegram-notification-buttons') return {
        telegramNotificationCallback: async () => { calls.push('callback'); if (options.storageError) throw Error(token); return options.ignored ? null : { answer: { method: 'answerCallbackQuery', callback_query_id: 'test-query', text: 'Выбор сохранён' } }; },
        applyTelegramNotificationEdit: async result => { calls.push('edit'); return result.answer; },
      };
      if (id === '@/lib/telegram-bot') return { telegramBotReply: () => assert.fail('Callback must not become a command') };
      if (id === '@/lib/telegram-source') return { normalizeTelegramPost: () => assert.fail('Callback must not become an opportunity') };
      if (id === '@/lib/telegram-source-discovery') return { approvedTelegramRules: () => assert.fail('Callback must not query channel rules') };
      if (id === '@/lib/disciplines') return {};
      return require(id);
    }
  });
  const { POST } = load(path.join(__dirname, '../app/api/telegram/webhook/route.ts'));
  return { calls, async run(signed = true) { const r = await POST(new Request(site + '/api/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', ...(signed ? { 'x-telegram-bot-api-secret-token': secret } : {}) }, body: JSON.stringify({ update_id: 5, callback_query: { id: 'test-query' } }) })); return { status: r.status, body: await r.json(), headers: r.headers }; } };
}
(async () => {
  let n = 0; const test = async (name, fn) => { await fn(); n++; console.log('PASS ' + name); };
  await test('unsigned callback webhooks fail before database access', async () => { const h = harness(); assert.equal((await h.run(false)).status, 401); assert.equal(h.calls.length, 0); });
  await test('notification callbacks use the protected handler and acknowledge Telegram without exposing a token', async () => { const h = harness(), r = await h.run(); assert.equal(r.status, 200); assert.equal(r.body.method, 'answerCallbackQuery'); assert(r.headers.get('cache-control').includes('private')); assert.deepEqual(h.calls, ['database', 'callback', 'edit']); assert(!JSON.stringify(r.body).includes(token)); });
  await test('unrecognized callbacks never fall through into channel ingestion', async () => { const h = harness({ ignored: true }), r = await h.run(); assert.equal(r.status, 200); assert.equal(r.body.ignored, true); assert.deepEqual(h.calls, ['database', 'callback']); });
  await test('missing bot configuration or storage errors do not report a successful preference change', async () => { for (const options of [{ env: { TELEGRAM_BOT_TOKEN: '' } }, { storageError: true }, { env: { LEADLY_SITE_URL: 'invalid' } }]) { const h = harness(options), r = await h.run(); assert.equal(r.status, 503); assert(!JSON.stringify(r.body).includes(token)); } });
  console.log('RESULT ' + n + ' notification callback webhook checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
