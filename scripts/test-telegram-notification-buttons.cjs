const assert = require('node:assert/strict');
const path = require('node:path');
const { createTsLoader } = require('./ts-loader.cjs');
const load = createTsLoader();
const buttons = load(path.join(__dirname, '../lib/telegram-notification-buttons.ts'));
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const sender = 1234567890, site = 'https://leadly.example', token = '123456:' + 'fixture_token_'.repeat(3);
function harness(options = {}) {
  const state = { owner: a, linked: true, settings: null, ...options }, calls = [], writes = [];
  const db = { from(table) {
    const q = { select() { return q; }, eq(key, value) {
      calls.push({ table, key, value });
      assert.equal(key, table === 'telegram_accounts' ? 'telegram_user_id' : 'user_id');
      assert.equal(value, table === 'telegram_accounts' ? sender : state.owner); return q;
    }, async maybeSingle() {
      if (state.failure === table) return { error: {} };
      return { data: table === 'telegram_accounts' ? state.linked ? { user_id: state.owner, chat_id: state.chatId ?? sender } : null : state.settings };
    } }; return q;
  }, async rpc(name, args) {
    assert.equal(name, 'leadly_set_telegram_job_notifications');
    assert.deepEqual(Object.keys(args).sort(), ['p_frequency', 'p_update_id', 'p_user_id']);
    assert.equal(args.p_update_id, 600);
    assert.equal(args.p_user_id, state.owner); writes.push(args);
    if (state.writeError) return { error: {} };
    if (state.refused) return { data: { ok: false } };
    state.settings = { opportunities_enabled: args.p_frequency !== 'off', tasks_enabled: state.settings?.tasks_enabled || false, opportunity_frequency: args.p_frequency === 'off' ? state.settings?.opportunity_frequency || 'updates' : args.p_frequency };
    return { data: { ok: true } };
  } };
  return { db, state, calls, writes };
}
const callback = data => ({ update_id: 600, callback_query: { id: 'callback-fixture', from: { id: sender, is_bot: false }, message: { message_id: 99, chat: { id: sender, type: 'private' }, from: { id: 777, is_bot: true, username: 'leadly_work_bot' } }, data } });
async function choice(h, mode) {
  const panel = await buttons.telegramNotificationPanel(h.db, sender, site);
  return panel.reply_markup.inline_keyboard.flat().find(b => b.callback_data?.startsWith('leadly:notify:' + mode + ':')).callback_data;
}
const run = (h, data) => buttons.telegramNotificationCallback(data, h.db, site, 'leadly_work_bot');
(async () => {
  let n = 0; const test = async (name, fn) => { await fn(); n++; console.log('PASS ' + name); };
  await test('new linked accounts get an explicit bot choice without being silently subscribed', async () => {
    const h = harness(), p = await buttons.telegramNotificationPanel(h.db, sender, site);
    assert(p.text.includes('Хочешь получать')); assert(p.text.includes('выключены')); assert.equal(h.writes.length, 0);
    const actions = p.reply_markup.inline_keyboard.flat().filter(b => b.callback_data);
    assert.equal(actions.length, 3); assert(actions.every(b => Buffer.byteLength(b.callback_data) <= 64));
    assert(!JSON.stringify(p).includes(a)); assert(!JSON.stringify(p).includes('chat_id'));
  });
  await test('unlinked users see a profile connection button and no opt-in controls', async () => {
    const h = harness({ linked: false }), p = await buttons.telegramNotificationPanel(h.db, sender, site);
    assert(p.text.includes('Подключи')); assert.equal(p.reply_markup.inline_keyboard.length, 1); assert.equal(h.calls.length, 1); assert.equal(h.writes.length, 0);
  });
  await test('updates and daily buttons save only the authenticated sender job frequency', async () => {
    for (const mode of ['updates', 'daily']) {
      const h = harness({ settings: { opportunities_enabled: false, tasks_enabled: true, opportunity_frequency: 'daily' } });
      const r = await run(h, callback(await choice(h, mode)));
      assert.equal(h.writes[0].p_frequency, mode); assert.equal(r.answer.method, 'answerCallbackQuery'); assert.equal(r.edit.chat_id, sender); assert.equal(r.edit.message_id, 99);
      assert(r.edit.text.includes('Напоминания о делах: включены')); assert(r.edit.reply_markup.inline_keyboard.flat().some(b => b.text.startsWith('✓ ') && b.callback_data?.includes(':' + mode + ':')));
    }
  });
  await test('stopping new jobs preserves reminders and never calls the disconnect RPC', async () => {
    const h = harness({ settings: { opportunities_enabled: true, tasks_enabled: true, opportunity_frequency: 'updates' } });
    const r = await run(h, callback(await choice(h, 'off')));
    assert.equal(h.writes[0].p_frequency, 'off'); assert.equal(h.state.settings.tasks_enabled, true); assert(r.edit.text.includes('выключены'));
  });
  await test('old buttons cannot change an account linked after disconnection', async () => {
    const h = harness(), data = await choice(h, 'updates'); h.state.owner = b;
    const r = await run(h, callback(data)); assert.equal(h.writes.length, 0); assert.equal(r.edit, undefined); assert.equal(r.answer.show_alert, true);
  });
  await test('forwarded controls and callbacks after unlinking never mutate preferences', async () => {
    const h = harness(), data = await choice(h, 'updates');
    const other = harness({ owner: b }); assert((await run(other, callback(data))).answer.show_alert); assert.equal(other.writes.length, 0);
    h.state.linked = false; assert((await run(h, callback(data))).answer.show_alert); assert.equal(h.writes.length, 0);
  });
  await test('groups, forged senders, bot actors and another bot message are rejected before storage', async () => {
    const h = harness(), data = await choice(h, 'updates'); h.calls.length = 0;
    for (const change of [q => q.message.chat.type = 'group', q => q.from.id = 5, q => q.from.is_bot = true, q => q.message.from.username = 'another_bot', q => q.message.message_id = 0, q => q.from.id = Number.MAX_SAFE_INTEGER + 1]) {
      const input = callback(data); change(input.callback_query); assert.equal(await run(h, input), null);
    }
    assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0);
  });
  await test('unknown or oversized payloads and invalid update IDs are ignored without side effects', async () => {
    const h = harness();
    for (const data of ['other:action', 'leadly:notify:bad:' + 'x'.repeat(22), 'leadly:notify:updates:' + 'x'.repeat(200)]) assert.equal(await run(h, callback(data)), null);
    const input = callback('other'); input.update_id = -1; assert.equal(await run(h, input), null); assert.equal(h.calls.length, 0);
  });
  await test('a corrupt recipient and storage errors never produce a successful change', async () => {
    const h = harness(), data = await choice(h, 'updates');
    for (const options of [{ chatId: 5 }, { failure: 'telegram_notification_settings' }, { writeError: true }]) {
      const broken = harness(options); await assert.rejects(() => run(broken, callback(data)));
    }
    const refused = harness({ refused: true }); const r = await run(refused, callback(data)); assert.equal(r.edit, undefined); assert(r.answer.show_alert);
  });
  await test('repeated clicks edit the same message without sending duplicate chat messages', async () => {
    const h = harness(), input = callback(await choice(h, 'updates'));
    for (let i = 0; i < 2; i++) {
      const r = await run(h, input); let calls = 0;
      const answer = await buttons.applyTelegramNotificationEdit(r, token, async (url, init) => {
        calls++; assert.equal(new URL(url).hostname, 'api.telegram.org'); assert(url.endsWith('/editMessageText')); assert.equal(init.redirect, 'error');
        const body = JSON.parse(init.body); assert.equal(body.chat_id, sender); assert.equal(body.message_id, 99);
        return Response.json({ ok: true, result: { message_id: 99, chat: { id: sender } } });
      });
      assert.equal(calls, 1); assert.equal(answer.method, 'answerCallbackQuery'); assert.equal(answer.show_alert, false); assert(!JSON.stringify(answer).includes(token));
    }
  });
  await test('already edited messages are acknowledged and an uncertain edit never becomes a false unsaved preference', async () => {
    const h = harness(), r = await run(h, callback(await choice(h, 'updates')));
    const unchanged = await buttons.applyTelegramNotificationEdit(r, token, async () => Response.json({ ok: false, error_code: 400, description: 'Bad Request: message is not modified' }, { status: 400 }));
    assert.equal(unchanged.show_alert, false);
    for (const fetcher of [async () => { throw Error(token); }, async () => Response.json({ ok: true, result: { message_id: 99, chat: { id: 1 } } })]) {
      const a = await buttons.applyTelegramNotificationEdit(r, token, fetcher); assert(a.text.includes('Выбор сохранён')); assert(a.show_alert); assert(!JSON.stringify(a).includes(token));
    }
  });
  console.log('RESULT ' + n + ' Telegram notification button checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
