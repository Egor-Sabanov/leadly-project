/* Offline proofs: synthetic Telegram signatures and mocked Auth/DB, no messages. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const load = require('./ts-loader.cjs').createTsLoader({ Buffer, URLSearchParams });
const { verifyTelegramInitData } = load(path.join(root, 'lib/telegram-init-data.ts'));
const { telegramDestination, telegramInset } = load(path.join(root, 'lib/telegram-navigation.ts'));
const { telegramBotReply } = load(path.join(root, 'lib/telegram-bot.ts'));
const { authCookieOptions } = load(path.join(root, 'lib/auth-cookies.ts'));
const token = '123456:' + 'fixture_test_token_'.repeat(2);
const now = 1800000000000;
const userId = '11111111-1111-4111-8111-111111111111';
function signed(fields = {}, key = token) {
  const params = new URLSearchParams({ auth_date: String(now / 1000), user: JSON.stringify({ id: 4503599627370000, username: 'test_user' }), ...fields });
  const check = [...params.entries()].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => k+'='+v).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(key).digest();
  params.set('hash',crypto.createHmac('sha256',secret).update(check).digest('hex'));
  return params.toString();
}
function message(text, changes = {}) {
  return { update_id: 500, message: { message_id: 1, chat: { id: 1234567890, type: 'private' }, from: { id: 1234567890, username: 'test_user' }, text, ...changes } };
}
function sessionHarness(options = {}) {
  const events = [];
  const client = { auth: {
    getUser: async () => ({ data: { user: options.currentUserId ? { id: options.currentUserId } : null }, error: null }),
    verifyOtp: async input => { events.push({type:'verify', input}); return { data: { user: { id: options.verifiedId || userId } }, error: options.otpError ? {} : null }; },
  } };
  const admin = {
    from(table) { assert.equal(table, 'telegram_accounts'); return { select: () => ({ eq: (key, id) => { events.push({type:'mapping',key,id}); return { maybeSingle: async () => ({data:options.unlinked ? null : {user_id:userId},error:options.databaseError ? {} : null}) }; } }) }; },
    auth: { admin: {
      getUserById: async id => { assert.equal(id,userId); return { data:{user:{ id:userId,email:'fixture@example.com',email_confirmed_at:options.unconfirmed ? null : new Date().toISOString(),banned_until:options.banned ? '2999-01-01' : null }},error:null}; },
      generateLink: async input => { events.push({type:'generate', input}); return {data:{user:{id:options.generatedId||userId},properties:{hashed_token:'private-fixture-otp'}},error:null}; },
    } },
  };
  const sandbox = {
    module:{exports:{}}, exports:{}, process:{env:{TELEGRAM_BOT_TOKEN:token}}, Buffer, URL, URLSearchParams, Request, Response,
    require(id) {
      if(id==='@/lib/telegram-server') return {telegramAdmin:()=>admin,telegramJson:(body,status=200)=>Response.json(body,{status})};
      if(id==='@/lib/supabase/server') return {createSupabaseServerClient:async()=>client};
      if(id==='@/lib/request-guards') return {...load(path.join(root,'lib/request-guards.ts')),sameOrigin:req=>req.headers.get('origin')==='https://leadly.example'};
      if(id==='next/headers') return {cookies:async()=>({set:(...args)=>events.push({type:'cookie',args})})};
      if(id.startsWith('@/')) return load(path.join(root,id.slice(2)+'.ts'));
      return require(id);
    },
  };
  const source = fs.readFileSync(path.join(root,'app/api/telegram/session/route.ts'),'utf8');
  vm.runInNewContext(ts.transpileModule(source+'\nmodule.exports={POST};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
  return { events, async run(action='login', proof=signed({auth_date:String(Math.floor(Date.now()/1000))}), origin='https://leadly.example') {
    const response=await sandbox.module.exports.POST(new Request('https://leadly.example/api/telegram/session',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action,initData:proof})}));
    return {response,body:await response.json()};
  } };
}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('valid HMAC includes optional signature and preserves 52-bit identity',()=>{
  const r=verifyTelegramInitData(signed({signature:'third-party-signature',query_id:'AA-test'}),token,now);
  assert.equal(r.id,4503599627370000);assert.equal(r.username,'test_user');
});
test('modified payload and wrong bot token fail verification',()=>{
  assert.throws(()=>verifyTelegramInitData(signed().replace('test_user','other_user'),token,now));
  assert.throws(()=>verifyTelegramInitData(signed({},'wrong-token'),token,now));
});
test('duplicate query keys and noncanonical signature lengths are rejected',()=>{
  assert.throws(()=>verifyTelegramInitData(signed()+'&user={}',token,now));
  assert.throws(()=>verifyTelegramInitData(signed().replace(/hash=[^&]+/,'hash=abc'),token,now));
});
test('expired and future login proofs are rejected',()=>{
  for(const delta of [-301,31]) assert.throws(()=>verifyTelegramInitData(signed({auth_date:String(now/1000+delta)}),token,now));
  assert.throws(()=>verifyTelegramInitData(signed({auth_date:'1e9'}),token,now));
});
test('user IDs must be positive safe integers and belong to a person',()=>{
  for(const id of [0,-1,'123',1.5,9007199254740992]) assert.throws(()=>verifyTelegramInitData(signed({user:JSON.stringify({id})}),token,now));
  assert.throws(()=>verifyTelegramInitData(signed({user:JSON.stringify({id:123,is_bot:true})}),token,now));
});
test('oversized and malformed signed user data fail closed',()=>{
  assert.throws(()=>verifyTelegramInitData('a'.repeat(16001),token,now));
  assert.throws(()=>verifyTelegramInitData(signed({user:'not-json'}),token,now));
});
test('native destinations cannot redirect outside the fixed app routes',()=>{
  for(const value of ['https://evil.example','//evil.example','/auth/social/google','/tasks?next=evil',null])assert.equal(telegramDestination(value),'/');
  for(const value of ['/','/tasks','/profile','/opportunities'])assert.equal(telegramDestination(value),value);
});
test('safe area values are bounded and ordinary web cookies stay Lax',()=>{
  assert.equal(telegramInset(Infinity),0);assert.equal(telegramInset(-1),0);assert.equal(telegramInset(999),200);
  assert.equal(authCookieOptions('https://leadly.example').sameSite,'lax');
  const cookie=authCookieOptions('https://leadly.example',true,true);assert.equal(cookie.sameSite,'none');assert.equal(cookie.secure,true);assert.equal(cookie.partitioned,true);
  assert.equal(authCookieOptions('http://localhost:3000',false,true).sameSite,'lax');
});
test('cross-origin and invalid proof requests never query Auth or the database',async()=>{
  const h=sessionHarness();assert.equal((await h.run('login',signed(),'https://evil.example')).response.status,403);
  assert.equal((await h.run('login','not-signed')).response.status,401);assert.equal(h.events.length,0);
});
test('native check never creates a session and identifies a different existing account',async()=>{
  const h=sessionHarness({currentUserId:'22222222-2222-4222-8222-222222222222'});const r=await h.run('check');
  assert.equal(r.response.status,200);assert.equal(r.body.authenticated,false);assert.equal(r.body.label,'@test_user');
  assert.equal(h.events.filter(e=>['generate','verify','cookie'].includes(e.type)).length,0);
});
test('a matching existing session may resume without a fresh Auth exchange',async()=>{
  const h=sessionHarness({currentUserId:userId});assert.equal((await h.run('check')).body.authenticated,true);assert.equal(h.events.filter(e=>e.type==='generate').length,0);
});
test('unlinked, banned and unconfirmed accounts cannot receive native sessions',async()=>{
  for(const options of [{unlinked:true},{banned:true},{unconfirmed:true},{databaseError:true}]){
    const h=sessionHarness(options);assert.notEqual((await h.run()).response.status,200);assert.equal(h.events.filter(e=>e.type==='generate').length,0);
  }
});
test('generated Auth identity must match the explicitly linked account',async()=>{
  const h=sessionHarness({generatedId:'22222222-2222-4222-8222-222222222222'});assert.equal((await h.run()).response.status,503);assert.equal(h.events.filter(e=>e.type==='verify').length,0);
});
test('confirmed native login exchanges the private OTP server-side only',async()=>{
  const h=sessionHarness();const r=await h.run();assert.equal(r.response.status,200);assert.equal(r.body.ok,true);
  assert.equal(h.events.filter(e=>e.type==='generate')[0].input.type,'magiclink');
  assert.equal(h.events.filter(e=>e.type==='verify')[0].input.token_hash,'private-fixture-otp');
  assert.ok(!JSON.stringify(r.body).includes('private-fixture-otp'));
  const cookie=h.events.find(e=>e.type==='cookie').args[2];assert.equal(cookie.partitioned,true);assert.equal(cookie.secure,true);
});
test('failed OTP never reports success',async()=>{const h=sessionHarness({otpError:true});assert.equal((await h.run()).response.status,503);});
test('private bot commands open only fixed HTTPS Mini App routes',async()=>{
  for(const [command,dest] of [['/start','/'],['/app','/'],['/tasks','/tasks'],['/profile','/profile'],['/opportunities','/opportunities']]){
    const reply=await telegramBotReply(message(command),{},'https://leadly.example','leadly_work_bot');const buttons=(reply.reply_markup.inline_keyboard||reply.reply_markup.keyboard).flat();const button=command==='/start'?buttons.find(b=>b.text==='📱 LEADLY'):buttons[0];const url=new URL(button.web_app.url);
    assert.equal(reply.method,'sendMessage');assert.equal(reply.chat_id,1234567890);assert.equal(url.origin,'https://leadly.example');assert.equal(url.pathname,'/telegram');assert.equal(url.searchParams.get('next'),dest);
  }
});
test('bot ignores groups, forged identities, other bots and unknown text',async()=>{
  for(const input of [message('/tasks',{chat:{id:1234567890,type:'group'}}),message('/tasks',{from:{id:3}}),message('/tasks',{from:{id:1234567890,is_bot:true}}),message('обычный текст'),message('/stop@another_bot')])assert.equal(await telegramBotReply(input,{},'https://leadly.example','leadly_work_bot'),null);
});
test('bot claims only a token hash and waits for confirmation on the website',async()=>{
  const nonce=crypto.randomBytes(32).toString('base64url'),calls=[];
  const db={rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true},error:null};}};
  const reply=await telegramBotReply(message('/start '+nonce),db,'https://leadly.example');
  assert.equal(calls[0].name,'leadly_claim_telegram_link');assert.equal(calls[0].args.p_token_hash,crypto.createHash('sha256').update(nonce).digest('hex'));
  assert.ok(!JSON.stringify(calls).includes(nonce));assert.match(reply.text,/подтверди/);
});
test('stop disconnects only the verified sender and never includes private app data',async()=>{
  const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true},error:null};}};
  const reply=await telegramBotReply(message('/stop'),db,'https://leadly.example');assert.equal(calls[0].args.p_telegram_user_id,1234567890);assert.equal(reply.reply_markup.remove_keyboard,true);
});
(async()=>{let passed=0;for(const [name,fn] of tests){try{await fn();passed++;console.log('PASS',name);}catch(error){console.error('FAIL',name,error.message);process.exitCode=1;}}console.log(`RESULT ${passed}/${tests.length} Telegram security checks passed`);})();
