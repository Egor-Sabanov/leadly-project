const {createClient}=require('@supabase/supabase-js');
const {runtimeHealth}=require('./ts-loader.cjs').createTsLoader()(require('node:path').join(__dirname,'../lib/runtime-health.ts'));
(async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('missing_server_configuration');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000)})}});
 const r=await db.from('leadly_runtime_runs').select('started_at,finished_at,status').order('started_at',{ascending:false}).limit(100);
 if(r.error)throw new Error('runtime_history_unavailable');
 const health=runtimeHealth(r.data||[]);console.log(JSON.stringify({readOnly:true,...health},null,2));if(!health.healthy)process.exitCode=1;
})().catch(e=>{console.error(JSON.stringify({healthy:false,error:['missing_server_configuration','runtime_history_unavailable'].includes(e.message)?e.message:'operations_check_failed'}));process.exitCode=1});
