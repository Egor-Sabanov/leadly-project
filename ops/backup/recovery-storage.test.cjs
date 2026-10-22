const assert=require('node:assert/strict');
const {recoveryClient}=require('./recovery-storage.cjs');
const {TARGET,SOURCE}=require('./hosted-restore.cjs');
(async()=>{
 let calls=0;
 assert.throws(()=>recoveryClient({ref:SOURCE,key:'fixture-key'}),/exact_recovery_target_required/);
 assert.throws(()=>recoveryClient({ref:TARGET}),/credential_missing/);
 const client=recoveryClient({ref:TARGET,key:'fixture-key',fetcher:async(input,options)=>{calls++;assert.equal(new URL(input).origin,'https://'+TARGET+'.supabase.co');assert.equal(options.redirect,'manual');return Response.json([]);}});
 const result=await client.storage.listBuckets();assert.equal(result.error,null);assert.deepEqual(result.data,[]);assert.equal(calls,1);
 const redirect=recoveryClient({ref:TARGET,key:'fixture-key',fetcher:async(input,options)=>{assert.equal(options.redirect,'manual');return new Response('redirect',{status:302,headers:{Location:'https://'+SOURCE+'.supabase.co/storage/v1/bucket'}});}});
 const denied=await redirect.storage.listBuckets();assert(denied.error);
 console.log('RESULT 4 recovery Storage credential and redirect checks; outbound requests 0');
})().catch(e=>{console.error(e);process.exitCode=1;});
