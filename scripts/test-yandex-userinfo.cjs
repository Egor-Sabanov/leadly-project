const assert=require('node:assert/strict'),path=require('node:path');
const {createTsLoader}=require('./ts-loader.cjs');
const {yandexClaims,yandexUserinfo}=createTsLoader()(path.join(__dirname,'../lib/yandex-userinfo.ts'));
const tests=[],test=(name,run)=>tests.push([name,run]);
const bearer='Bearer '+'a'.repeat(48);
test('normalizes only stable ID, necessary email and bounded display name',()=>{
 const claims=yandexClaims({id:'1234567',default_email:'own@example.com',real_name:'  Проверка  ',emails:['private@example.com'],access_token:'never-return'});
 assert.equal(claims.sub,'1234567');assert.equal(claims.email_verified,false);assert.equal(claims.name,'Проверка');assert.deepEqual(Object.keys(claims).sort(),['email','email_verified','name','sub']);
 assert.equal(yandexClaims({id:'1',default_email:'a@example.com',real_name:'x'.repeat(500)}).name.length,80);
});
test('refuses missing email or identity without inventing a synthetic address',()=>{
 for(const value of [null,[],{}, {id:'1'},{id:'',default_email:'a@example.com'},{id:'../x',default_email:'a@example.com'},{id:'1',default_email:'not-an-email'},{id:'1',default_email:'a@example.com\nextra'}])assert.equal(yandexClaims(value),null);
});
test('cannot use query tokens, untrusted auth schemes or malformed headers',async()=>{
 let calls=0;for(const auth of ['', 'OAuth secret', 'Bearer short','Bearer '+ 'a'.repeat(4097)]){const r=await yandexUserinfo(new Request('https://app.example/api/auth/yandex/userinfo?access_token=secret',{headers:{authorization:auth}}),async()=>{calls++;throw Error();});assert.equal(r.status,401);}assert.equal(calls,0);
});
test('fetches only the fixed provider with credentials in header and no redirects/cache',async()=>{
 const r=await yandexUserinfo(new Request('https://app.example/api/auth/yandex/userinfo?url=https://evil.example',{headers:{authorization:bearer}}),async(url,init)=>{assert.equal(url,'https://login.yandex.ru/info?format=json');assert.equal(init.headers.Authorization,'OAuth '+bearer.slice(7));assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');return Response.json({id:'123',default_email:'own@example.com'});});
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal((await r.json()).email_verified,false);
});
test('provider rejection never exposes token or raw provider error',async()=>{
 for(const status of [401,403,429,500]){const r=await yandexUserinfo(new Request('https://app.example',{headers:{authorization:bearer}}),async()=>new Response('token=private email=private@example.com',{status}));assert.equal(r.status,[401,403].includes(status)?401:503);assert.ok(!(await r.text()).includes('private'));}
});
test('incomplete or malformed provider profiles fail closed',async()=>{
 for(const response of [Response.json({id:'123'}),new Response('not json'),new Response('a'.repeat(64001)),new Response('x',{headers:{'content-length':'64001'}})]){const r=await yandexUserinfo(new Request('https://app.example',{headers:{authorization:bearer}}),async()=>response);assert.ok([422,503].includes(r.status));}
});
test('network failures expose a constant safe result',async()=>{
 const r=await yandexUserinfo(new Request('https://app.example',{headers:{authorization:bearer}}),async()=>{throw Error('bearer=secret internal details');});assert.equal(r.status,503);assert.equal((await r.json()).error,'provider_unavailable');
});
(async()=>{let failures=0;for(const [name,run] of tests){try{await run();console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+': '+e.message);}}console.log(`RESULT ${tests.length-failures}/${tests.length} Yandex userinfo checks passed`);if(failures)process.exitCode=1;})();
