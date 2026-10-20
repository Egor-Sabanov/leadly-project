const assert=require('node:assert/strict'),path=require('node:path');
const {probeSupabaseSiteURL}=require('./ts-loader.cjs').createTsLoader()(path.join(__dirname,'../lib/auth-site-probe.ts'));
const id='11111111-1111-4111-8111-111111111111',site='https://leadly.example';
function mock(options={}){let marker,calls=[];const db={auth:{admin:{
 createUser:async input=>{marker=input.user_metadata.leadly_validation_run;calls.push('create');return {data:{user:{id}},error:null};},
 generateLink:async input=>{assert.equal(input.type,'recovery');assert.equal(Object.hasOwn(input,'options'),false);calls.push('generate');if(options.failure)throw new Error('private token=secret');return {data:{user:{id:options.wrongUser?'22222222-2222-4222-8222-222222222222':id},properties:{redirect_to:options.fallback?null:options.target||site,action_link:'https://sb.example/auth/v1/verify?token=PRIVATE&redirect_to='+encodeURIComponent(options.target||site)}},error:null};},
 getUserById:async own=>{assert.equal(own,id);return {data:{user:{id,user_metadata:{leadly_validation_run:options.wrongMarker?'wrong':marker}}},error:null};},
 deleteUser:async own=>{assert.equal(own,id);calls.push('delete');return {error:options.deleteError?{}:null};},
}}};return {db,calls};}
(async()=>{let n=0;const test=async(name,run)=>{await run();n++;console.log('PASS '+name);};
 await test('canonical Site URL is checked without a redirect override or sending mail',async()=>{const h=mock();const r=await probeSupabaseSiteURL(h.db,site);assert(r.completed&&r.cleaned&&r.siteURLMatches);assert.equal(r.mailSent,false);assert.equal(h.calls.join(','),'create,generate,delete');});
 await test('localhost and non-root defaults fail even if an explicit application callback would be allowed',async()=>{for(const target of ['http://localhost:3000',site+'/auth/callback',site+'?token=private']){const r=await probeSupabaseSiteURL(mock({target}).db,site);assert.equal(r.siteURLMatches,false);assert.equal(r.cleaned,true);assert.equal(r.errorCode,'site_url_mismatch');assert(!JSON.stringify(r).includes('token=private'));}});
 await test('fallback action URL is parsed without recording its credential',async()=>{const r=await probeSupabaseSiteURL(mock({fallback:true}).db,site);assert.equal(r.siteURLMatches,true);assert(!JSON.stringify(r).includes('PRIVATE'));});
 await test('failed or wrong-user generation still cleans only the created fixture and hides raw error text',async()=>{for(const options of [{failure:true},{wrongUser:true}]){const h=mock(options);const r=await probeSupabaseSiteURL(h.db,site);assert.equal(r.completed,false);assert.equal(r.cleaned,true);assert(h.calls.includes('delete'));assert(!JSON.stringify(r).includes('secret'));}});
 await test('cleanup refuses a different marker and never deletes an unrelated user',async()=>{const h=mock({wrongMarker:true});const r=await probeSupabaseSiteURL(h.db,site);assert.equal(r.cleaned,false);assert(!h.calls.includes('delete'));assert.equal(r.errorCode,'fixture_cleanup_failed');});
 await test('cleanup failure cannot be reported as a completely successful probe',async()=>{const r=await probeSupabaseSiteURL(mock({deleteError:true}).db,site);assert.equal(r.cleaned,false);assert.equal(r.errorCode,'fixture_cleanup_failed');});
 console.log('RESULT '+n+' canonical auth site checks');
})().catch(e=>{console.error(e);process.exitCode=1});
