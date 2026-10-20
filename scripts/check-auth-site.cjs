const {createClient}=require('@supabase/supabase-js'),path=require('node:path');
const {siteOrigin}=require('./deployment-probe.cjs');
const {probeSupabaseSiteURL}=require('./ts-loader.cjs').createTsLoader()(path.join(__dirname,'../lib/auth-site-probe.ts'));
(async()=>{
 const expected=siteOrigin(process.argv[2]||process.env.LEADLY_SITE_URL);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error();
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000)})}});
 const result=await probeSupabaseSiteURL(db,expected);console.log(JSON.stringify(result,null,2));if(!result.completed||!result.cleaned||!result.siteURLMatches)process.exitCode=1;
})().catch(()=>{console.error(JSON.stringify({completed:false,errorCode:'auth_site_check_unavailable',mailSent:false}));process.exitCode=1});
