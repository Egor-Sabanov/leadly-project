const assert = require('node:assert/strict');
const path = require('node:path');
const { createTsLoader } = require('./ts-loader.cjs');
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const guards = createTsLoader()(path.join(__dirname, '../lib/request-guards.ts'));
let n = 0;
async function check(name, options, expected, inspect = () => {}) {
  let queried = false;
  const load = createTsLoader({ process: { env: { LEADLY_OPERATOR_USER_IDS: options.allowed ?? owner } }, require(id) {
    if (id === '@/lib/account-api') return { accountApi: async () => options.anonymous ? { error: Response.json({}, { status: 401 }) } : { account: { user: { id: options.user || owner } } } };
    if (id === '@/lib/request-guards') return guards;
    if (id === '@/lib/telegram-server') return { telegramAdmin: () => ({ from: table => { queried = true; assert.equal(table, 'telegram_accounts'); return { select: () => ({ eq: (column, id) => { assert.equal(column, 'user_id'); assert.equal(id, owner); return { maybeSingle: async () => ({ data: options.mapping ?? { telegram_user_id: 12345, chat_id: 12345 }, error: options.error }) }; } }) }; } }) };
    throw Error('Unexpected dependency');
  } });
  const { GET } = load(path.join(__dirname, '../app/api/operations/monitor-recipient/route.ts'));
  const response = await GET(new Request('https://leadly.example/api/operations/monitor-recipient')); assert.equal(response.status, expected); await inspect(response, queried); n++; console.log('PASS ' + name);
}
(async () => {
  await check('anonymous monitor recipient requests cannot read a Telegram mapping', { anonymous: true }, 401, (_, queried) => assert.equal(queried, false));
  await check('ordinary accounts cannot read another operator recipient', { user: other }, 403, (_, queried) => assert.equal(queried, false));
  await check('empty operator configuration fails closed', { allowed: '' }, 403, (_, queried) => assert.equal(queried, false));
  await check('operator sees only their own verified private mapping', {}, 200, async r => { assert.equal(r.headers.get('cache-control'), 'private, no-store, max-age=0'); assert.deepEqual(await r.json(), { chatId: '12345', bot: 'leadly_work_bot' }); });
  await check('mismatched recipient or storage error exposes no ID', { mapping: { telegram_user_id: 12345, chat_id: 67890 } }, 409, async r => assert(!JSON.stringify(await r.json()).includes('67890')));
  console.log('RESULT ' + n + ' operator recipient checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
