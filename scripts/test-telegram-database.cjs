/* Real local PostgreSQL/WASM. Supabase Auth is a minimal isolated fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/0007_telegram_accounts.sql'),'utf8');
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
const r1='33333333-3333-4333-8333-333333333333', r2='44444444-4444-4444-8444-444444444444';
const h1='a'.repeat(64), h2='b'.repeat(64);
(async()=>{
 const db=new PGlite();let passed=0;
 async function test(name,fn){await fn();passed++;console.log('PASS',name);}
 async function role(name){await db.exec('reset role;set role '+name);}
 async function rpc(name,params){const args=params.map((_,i)=>'$'+(i+1)).join(',');return (await db.query('select public.'+name+'('+args+') as value',params)).rows[0].value;}
 async function request(id,user,hash,expired=false){await role('postgres');await db.query(`insert into public.telegram_link_requests(id,user_id,token_hash,created_at,expires_at) values($1,$2,$3,now()-interval '5 minutes',now()+($4::integer*interval '1 minute')) on conflict(user_id) do update set id=excluded.id,token_hash=excluded.token_hash,created_at=excluded.created_at,expires_at=excluded.expires_at,telegram_user_id=null,telegram_username=null,chat_id=null`,[id,user,hash,expired?-1:4]);await role('service_role');}
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.existing_module(id integer primary key,value text);insert into public.existing_module values(1,'keep');insert into auth.users values('${a}'),('${b}');`);
  await test('migration is additive, repeatable and enables RLS immediately',async()=>{
   await db.exec(sql);await db.exec(sql);
   const rows=(await db.query("select relname,relrowsecurity from pg_class where relname in ('telegram_accounts','telegram_link_requests') order by relname")).rows;
   assert.equal(rows.length,2);assert.ok(rows.every(row=>row.relrowsecurity));
   assert.equal((await db.query('select value from public.existing_module')).rows[0].value,'keep');
  });
  await test('anonymous and authenticated clients cannot access Telegram storage or RPCs',async()=>{
   for(const name of ['anon','authenticated']){
    await role(name);
    for(const table of ['telegram_accounts','telegram_link_requests']) await assert.rejects(()=>db.query('select * from public.'+table));
    await assert.rejects(()=>rpc('leadly_claim_telegram_link',[h1,101,'owner_test',101]));
    await assert.rejects(()=>rpc('leadly_confirm_telegram_link',[a,r1]));
    await assert.rejects(()=>rpc('leadly_disconnect_telegram',[a,null]));
   }
  });
  await test('private functions use an empty search path',async()=>{
   await role('postgres');const rows=(await db.query("select proconfig from pg_proc where proname in ('leadly_claim_telegram_link','leadly_confirm_telegram_link','leadly_disconnect_telegram')")).rows;
   assert.equal(rows.length,3);assert.ok(rows.every(row=>row.proconfig.some(value=>value==='search_path=""')));
  });
  await test('an unclaimed request cannot be confirmed',async()=>{
   await request(r1,a,h1);assert.equal((await rpc('leadly_confirm_telegram_link',[a,r1])).ok,false);
  });
  await test('claiming records a candidate without creating a login mapping',async()=>{
   assert.equal((await rpc('leadly_claim_telegram_link',[h1,101,'owner_test',101])).ok,true);
   assert.equal((await db.query('select * from public.telegram_accounts')).rows.length,0);
   assert.equal((await db.query('select telegram_user_id from public.telegram_link_requests')).rows[0].telegram_user_id,101);
  });
  await test('a second Telegram identity cannot replace the claimed candidate',async()=>{
   assert.equal((await rpc('leadly_claim_telegram_link',[h1,202,'other_test',202])).ok,false);
   assert.equal((await db.query('select telegram_user_id from public.telegram_link_requests')).rows[0].telegram_user_id,101);
  });
  await test('a repeated delivery by the same Telegram user is idempotent',async()=>{
   assert.equal((await rpc('leadly_claim_telegram_link',[h1,101,'owner_test',101])).ok,true);
  });
  await test('a different LEADLY owner cannot confirm the request',async()=>{
   assert.equal((await rpc('leadly_confirm_telegram_link',[b,r1])).ok,false);
   assert.equal((await db.query('select * from public.telegram_accounts')).rows.length,0);
  });
  await test('owner confirmation creates one mapping and consumes the token',async()=>{
   assert.equal((await rpc('leadly_confirm_telegram_link',[a,r1])).ok,true);
   const row=(await db.query('select * from public.telegram_accounts')).rows[0];assert.equal(row.user_id,a);assert.equal(row.telegram_user_id,101);assert.equal(row.notice_version,'telegram-2026-10-20.1');
   assert.equal((await db.query('select * from public.telegram_link_requests')).rows.length,0);
  });
  await test('a consumed token cannot be claimed or confirmed again',async()=>{
   assert.equal((await rpc('leadly_claim_telegram_link',[h1,101,'owner_test',101])).ok,false);
   assert.equal((await rpc('leadly_confirm_telegram_link',[a,r1])).ok,false);
  });
  await test('a Telegram identity cannot be attached to two LEADLY accounts',async()=>{
   await request(r2,b,h2);await rpc('leadly_claim_telegram_link',[h2,101,'owner_test',101]);
   assert.equal((await rpc('leadly_confirm_telegram_link',[b,r2])).ok,false);
   const rows=(await db.query('select user_id from public.telegram_accounts')).rows;assert.equal(rows.length,1);assert.equal(rows[0].user_id,a);
  });
  await test('disconnecting another owner leaves the first connection intact',async()=>{
   assert.equal((await rpc('leadly_disconnect_telegram',[b,null])).ok,true);
   assert.equal((await db.query('select user_id from public.telegram_accounts')).rows[0].user_id,a);
  });
  await test('a connected account cannot be silently replaced by a new Telegram user',async()=>{
   await request(r1,a,h1);await rpc('leadly_claim_telegram_link',[h1,202,'other_test',202]);
   assert.equal((await rpc('leadly_confirm_telegram_link',[a,r1])).reason,'already_connected');
   assert.equal((await db.query('select telegram_user_id from public.telegram_accounts')).rows[0].telegram_user_id,101);
  });
  await test('stop removes only its mapping and pending token',async()=>{
   assert.equal((await rpc('leadly_disconnect_telegram',[null,101])).ok,true);
   assert.equal((await db.query('select * from public.telegram_accounts')).rows.length,0);
   assert.equal((await db.query('select * from public.telegram_link_requests')).rows.length,0);
  });
  await test('expired token cannot be claimed',async()=>{
   await request(r1,a,h1,true);assert.equal((await rpc('leadly_claim_telegram_link',[h1,101,'owner_test',101])).ok,false);
  });
  await test('expired claimed token cannot be confirmed',async()=>{
   await role('postgres');await db.query('update public.telegram_link_requests set telegram_user_id=101,chat_id=101 where id=$1',[r1]);await role('service_role');assert.equal((await rpc('leadly_confirm_telegram_link',[a,r1])).ok,false);
  });
  await test('table constraints reject inconsistent candidate chat IDs',async()=>{
   await role('postgres');await assert.rejects(()=>db.query('update public.telegram_link_requests set telegram_user_id=101,chat_id=null where id=$1',[r1]));
   await assert.rejects(()=>db.query('update public.telegram_link_requests set telegram_user_id=101,chat_id=202 where id=$1',[r1]));
   await assert.rejects(()=>db.query("update public.telegram_link_requests set expires_at=created_at+interval '11 minutes' where id=$1",[r1]));
  });
  await test('deleting a fixture owner cascades only its Telegram request',async()=>{
   await db.query('delete from auth.users where id=$1',[a]);assert.equal((await db.query('select * from public.telegram_link_requests')).rows.length,0);
   assert.equal((await db.query('select count(*)::integer as n from auth.users')).rows[0].n,1);
   assert.equal((await db.query('select value from public.existing_module')).rows[0].value,'keep');
  });
  console.log(`RESULT ${passed}/${passed} Telegram PostgreSQL checks passed`);
 } finally {await db.close();}
})().catch(error=>{console.error('Telegram PostgreSQL check failed:',error.message);process.exitCode=1;});
