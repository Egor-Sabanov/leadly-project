const assert = require('node:assert/strict');
const path = require('node:path');
const { createTsLoader } = require('./ts-loader.cjs');
const own = '11111111-1111-4111-8111-111111111111', peer = '22222222-2222-4222-8222-222222222222';
const guards = createTsLoader()(path.join(__dirname, '../lib/request-guards.ts'));
function harness(options = {}) {
  const calls = [], order = [];
  const db = {
    from(table) {
      const q = { select() { return q; }, eq(key, value) { calls.push({ table, key, value }); return q; }, order() { return q; }, limit() { return q; },
        maybeSingle: async () => options.storageError ? { error: new Error('private storage details') } : { data: table === 'telegram_accounts' ? (options.unlinked ? null : { user_id: own }) : null },
        then(resolve) { resolve({ data: [], error: options.storageError ? new Error('private storage details') : null }); } };
      return q;
    },
    async rpc(name, args) { calls.push({ name, args }); return options.storageError ? { error: new Error('private storage details') } : { data: { ok: !options.unlinked } }; },
  };
  const load = createTsLoader({ require(id) {
    if (id === '@/lib/account-api') return { async accountApi(request, mutation) {
      if (mutation && request.headers.get('origin') !== 'https://app.example') return { error: Response.json({}, { status: 403 }) };
      return options.signedOut ? { error: Response.json({}, { status: 401 }) } : { account: { user: { id: own } } };
    } };
    if (id === '@/lib/request-guards') return guards;
    if (id === '@/lib/telegram-server') return { telegramAdmin: () => db, telegramConfigured: () => !options.unconfigured, telegramJson: (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } }) };
    if (id === '@/lib/telegram-delivery') return { verifyTelegramDeliveryBot: async () => { order.push('verify'); if (options.wrongBot) throw new Error('private token'); }, processTelegramDelivery: async (_db, id, kind) => { order.push('send'); calls.push({ id, kind }); return 'sent'; } };
    return require(id);
  } });
  return { calls, order, routes: ['notifications/route.ts','notifications/test/route.ts'].map(file => load(path.join(__dirname, '../app/api/telegram', file))) };
}
function request(body, origin = 'https://app.example') { return new Request('https://app.example/api/telegram/notifications', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }); }
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
(async () => {
  await test('notification endpoints reject missing sessions and cross-origin mutations before storage or delivery', async () => {
    for (const options of [{ signedOut: true }, {}]) for (const index of [0,1]) { const h = harness(options), r = await h.routes[index].POST(request({ send: true }, options.signedOut ? undefined : 'https://evil.example')); assert.equal(r.status, options.signedOut ? 401 : 403); assert.equal(h.calls.length, 0); assert.equal(h.order.length, 0); }
  });
  await test('malformed, excessive and incomplete settings are client errors without mutations', async () => {
    for (const body of ['{', 'x'.repeat(1001), {}, { opportunities: 'yes', tasks: false }, { opportunities: true, tasks: false, consent: false }, { opportunities: true, tasks: false }]) { const h = harness(); const r = await h.routes[0].POST(request(body)); assert.equal(r.status,400); assert.equal(h.calls.length,0); }
  });
  await test('explicit opt-in uses only the authenticated owner and ignores forged recipients', async () => {
    const h = harness(), r = await h.routes[0].POST(request({ opportunities: true, tasks: false, consent: true, user_id: peer, chat_id: 1 })); assert.equal(r.status,200); assert.deepEqual(JSON.parse(JSON.stringify(h.calls.map(c=>c.args))),[{p_user_id:own,p_opportunities:true,p_tasks:false,p_frequency:"daily"}]);
  });
  await test('opting out requires no renewed consent and preserves the mapped account', async () => {
    const h = harness(), r = await h.routes[0].POST(request({ opportunities:false,tasks:false })); assert.equal(r.status,200); assert.equal(h.calls[0].name,'leadly_set_telegram_notifications'); assert.equal(h.calls.length,1);
  });
  await test('settings reads are private, owner-scoped and unchecked until saved', async () => {
    const h = harness(), r = await h.routes[0].GET(new Request('https://app.example/api/telegram/notifications')); assert.equal(r.status,200); assert.equal(r.headers.get('cache-control'),'private, no-store'); const data=await r.json(); assert.equal(data.settings.opportunities_enabled,false); assert.equal(data.settings.tasks_enabled,false); assert(h.calls.every(c=>c.value===own));
  });
  await test('missing connection exposes no peer settings and rejects enabling', async () => {
    const h = harness({unlinked:true}), r = await h.routes[0].GET(new Request('https://app.example/api/telegram/notifications')); assert.deepEqual(await r.json(),{available:false}); assert.equal(h.calls.length,1); const w=await h.routes[0].POST(request({opportunities:true,tasks:true,consent:true})); assert.equal(w.status,409);
  });
  await test('test message requires its own explicit action and validates input before Bot API', async () => {
    for (const body of [{}, {send:false}, '{', 'x'.repeat(501)]) {const h=harness(); assert.equal((await h.routes[1].POST(request(body))).status,400); assert.equal(h.order.length,0);}
  });
  await test('explicit test verifies the bot first and fixes actor and kind to the session', async () => {
    const h=harness(); const r=await h.routes[1].POST(request({send:true,user_id:peer,chat_id:1,text:'forged'})); assert.equal(r.status,200); assert.deepEqual(h.order,['verify','send']); assert.deepEqual(h.calls,[{id:own,kind:'test'}]); assert.deepEqual(await r.json(),{status:'sent'});
  });
  await test('bot identity or storage failure never sends and returns no raw token or storage details', async () => {
    const h=harness({wrongBot:true}); const r=await h.routes[1].POST(request({send:true})); assert.equal(r.status,503); assert.deepEqual(h.order,['verify']); assert(!(await r.text()).includes('private token')); const bad=harness({storageError:true}); const s=await bad.routes[0].POST(request({opportunities:false,tasks:false})); assert.equal(s.status,503); assert(!(await s.text()).includes('private storage'));
  });
  console.log('RESULT '+count+' Telegram notification API checks');
})().catch(error=>{console.error(error);process.exitCode=1;});
