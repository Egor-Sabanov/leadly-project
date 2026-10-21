const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const migration = name => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8');
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', c = '33333333-3333-4333-8333-333333333333';
(async () => {
  const db = new PGlite(); let n = 0;
  const rpc = async (name, args) => (await db.query('select public.' + name + '(' + args.map((_, i) => '$' + (i + 1)).join(',') + ') value', args)).rows[0].value;
  const read = async id => (await db.query('select * from public.telegram_notification_settings where user_id=$1', [id])).rows[0];
  const set = (id, mode) => rpc('leadly_set_telegram_job_notifications', [id, mode]);
  const all = (id, jobs, tasks, mode = 'daily') => rpc('leadly_set_telegram_notifications', [id, jobs, tasks, mode]);
  const test = async (name, fn) => { await fn(); n++; console.log('PASS ' + name); };
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false,banned_until timestamptz,deleted_at timestamptz);create table public.profiles(id uuid primary key,timezone text);insert into auth.users(id,email_confirmed_at) values('${a}',now()),('${b}',now()),('${c}',null);insert into public.profiles values('${a}','UTC'),('${b}','UTC'),('${c}','UTC');`);
    await db.exec(migration('0007_telegram_accounts.sql'));
    await db.exec(`insert into public.telegram_accounts(user_id,telegram_user_id,chat_id) values('${a}',101,101),('${b}',202,202),('${c}',303,303)`);
    for (const name of ['0010_telegram_notifications.sql', '0012_feed_notifications.sql', '0013_stream_delivery_guard.sql', '0014_telegram_bot_notifications.sql']) await db.exec(migration(name));
    await test('installing bot controls is repeatable and does not subscribe existing accounts', async () => {
      await db.exec(migration('0014_telegram_bot_notifications.sql')); assert.equal((await db.query('select * from public.telegram_notification_settings')).rows.length, 0);
      assert.equal((await db.query('select * from public.telegram_accounts')).rows.length, 3);
    });
    await test('anonymous and ordinary sessions cannot use the privileged bot preference RPC', async () => {
      for (const role of ['anon', 'authenticated']) { await db.exec('set role ' + role); await assert.rejects(() => set(a, 'updates')); await db.exec('reset role'); }
      await db.exec('set role service_role');
    });
    await test('invalid choices and unlinked identities do not create subscriptions', async () => {
      for (const pair of [[null, 'updates'], [a, null], [a, 'bad'], ['44444444-4444-4444-8444-444444444444', 'updates']]) assert.equal((await set(...pair)).ok, false);
      assert.equal((await db.query('select * from public.telegram_notification_settings')).rows.length, 0);
    });
    await test('first explicit bot opt-in enables only jobs with a fresh cursor', async () => {
      assert.equal((await set(a, 'updates')).ok, true); const s = await read(a);
      assert.equal(s.opportunities_enabled, true); assert.equal(s.tasks_enabled, false); assert.equal(s.opportunity_frequency, 'updates'); assert(Date.now() - +new Date(s.cursor_at) < 10000);
    });
    await test('unconfirmed and newly banned accounts cannot enable jobs', async () => {
      assert.equal((await set(c, 'updates')).ok, false); assert.equal((await read(c)).opportunities_enabled, false);
      await db.exec('reset role'); await db.query('update auth.users set banned_until=now()+interval \'1 day\' where id=$1', [b]); await db.exec('set role service_role');
      assert.equal((await set(b, 'updates')).ok, false); assert.equal((await read(b)).opportunities_enabled, false);
      await db.exec('reset role'); await db.query('update auth.users set banned_until=null where id=$1', [b]); await db.exec('set role service_role');
    });
    await test('daily, update and off choices preserve reminders and other accounts', async () => {
      await all(a, true, true); await all(b, true, false, 'updates'); const other = await read(b);
      for (const mode of ['updates', 'daily', 'off']) { await set(a, mode); const s = await read(a); assert.equal(s.tasks_enabled, true); assert.equal(s.opportunities_enabled, mode !== 'off'); assert.deepEqual(await read(b), other); }
      assert.equal((await db.query('select * from public.telegram_accounts')).rows.length, 3);
    });
    await test('unchanged bot choices preserve revision and do not replay the consumed job window', async () => {
      await set(a, 'updates'); await db.query("update public.telegram_notification_settings set cursor_at=now()-interval '1 day' where user_id=$1", [a]);
      const before = await read(a); await set(a, 'updates'); assert.deepEqual(await read(a), before);
      await set(a, 'daily'); assert.equal(+new Date((await read(a)).cursor_at), +new Date(before.cursor_at));
    });
    await test('a changed bot preference invalidates prepared delivery proof before sending', async () => {
      await set(a, 'updates'); const d = await rpc('leadly_claim_telegram_delivery', [a, 'test']); assert.equal(d.status, 'claimed');
      await set(a, 'off'); assert.equal(await rpc('leadly_begin_telegram_send', [d.id, d.lease]), false);
      assert.equal((await read(a)).tasks_enabled, true);
    });
    await test('a duplicate or older webhook cannot undo a later off choice in the bot or on the web', async () => {
      const click = (mode, id) => rpc('leadly_set_telegram_job_notifications', [a, mode, id]);
      assert.equal((await click('updates', 600)).ok, true);
      await all(a, false, true); const off = await read(a);
      assert.equal((await click('updates', 600)).applied, false); assert.deepEqual(await read(a), off);
      assert.equal((await click('off', 602)).ok, true); const newer = await read(a);
      assert.equal((await click('updates', 601)).applied, false); assert.deepEqual(await read(a), newer);
      assert.equal((await click('daily', 603)).ok, true); assert.equal((await read(a)).opportunity_frequency, 'daily');
    });
    await test('invalid callback ordering identifiers do not create preferences', async () => {
      for (const id of [null, -1, '9007199254740992']) assert.equal((await rpc('leadly_set_telegram_job_notifications', [c, 'updates', id])).ok, false);
      for (const role of ['anon', 'authenticated']) {
        await db.exec('reset role;set role ' + role);
        await assert.rejects(() => rpc('leadly_set_telegram_job_notifications', [a, 'updates', 604]));
      }
      await db.exec('reset role;set role service_role');
    });
    await test('a fresh Telegram sequence after a week of inactivity is accepted', async () => {
      await db.query("update public.telegram_notification_settings set bot_update_at=now()-interval '7 days' where user_id=$1", [a]);
      assert.equal((await rpc('leadly_set_telegram_job_notifications', [a, 'updates', 10])).ok, true);
      const s = await read(a); assert.equal(s.opportunities_enabled, true); assert.equal(s.bot_update_id, 10); assert.equal(s.tasks_enabled, true);
    });
    console.log('RESULT ' + n + ' bot job notification SQL checks');
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
