const crypto=require('node:crypto');
const TARGET='umexhmyeheonfsktcyqi';
const SOURCE='leezcyaqhozguvcehcpd';
const transientPublic=new Set(['leadly_runtime_runs','leadly_runtime_leases','leadly_ai_requests','telegram_link_requests','vk_link_requests','telegram_notification_deliveries']);
const identifier=s=>{if(!/^[a-z_][a-z0-9_]*$/.test(s))throw new Error('unsafe_restore_identifier');return '"'+s+'"';};
const literal=s=>"'"+String(s).replace(/'/g,"''")+"'";
function targetGuard(ref){if(ref!==TARGET||ref===SOURCE)throw new Error('exact_recovery_target_required');}
async function managementQuery({ref,token,query,readOnly=true,fetcher=fetch}){
 targetGuard(ref);if(!token)throw new Error('recovery_management_credential_missing');
 let response;try{response=await fetcher('https://api.supabase.com/v1/projects/'+TARGET+'/database/query',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(120000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:readOnly})});}catch{throw new Error('recovery_management_transport_failed');}
 if(!response.ok)throw new Error('recovery_management_http_'+response.status);
 try{return await response.json();}catch{throw new Error('invalid_recovery_management_response');}
}
function sqlFromDump(text){
 // pg_dump output is trusted only after encrypted archive hash/provenance checks.
 // Do not run psql metacommands through the Management API, or replace public.
 return text.split('\n').filter(line=>{
  if(/^\\(?:un)?restrict [A-Za-z0-9]+$/.test(line))return false;
  if(line.startsWith('\\'))throw new Error('unexpected_dump_metacommand');
  if(line.startsWith('ALTER DEFAULT PRIVILEGES ')){
   if(!/^ALTER DEFAULT PRIVILEGES FOR ROLE (?:postgres|supabase_admin) IN SCHEMA public GRANT ALL ON (?:TABLES|FUNCTIONS|SEQUENCES) TO (?:postgres|authenticated|anon|service_role);$/.test(line))throw new Error('unsupported_default_privilege_restore');
   return false; // Keep the target platform's defaults; explicit object ACLs follow.
  }
  return line!=='CREATE SCHEMA public;'&&!/^COMMENT ON SCHEMA public IS /.test(line);
 }).map(line=>{
  if(/^SET (?:statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout) = /.test(line))return '';
  if(line.startsWith('SET '))return line.replace(/^SET /,'SET LOCAL ');
  return line.replace("SELECT pg_catalog.set_config('search_path', '', false);","SELECT pg_catalog.set_config('search_path', '', true);");
 }).join('\n');
}
function sanitizeUser(row){
 const result={...row};
 for(const key of Object.keys(result)){
  if(/(?:_token|_token_new|_token_current)$/.test(key)||key==='email_change'||key==='phone_change')result[key]='';
  if(/_sent_at$/.test(key))result[key]=null;
 }
 if(Object.hasOwn(result,'email_change_confirm_status'))result.email_change_confirm_status=0;
 return result;
}
const hashQuery=(schema,table,omit=[])=>{
 const row='to_jsonb(t)'+omit.map(c=>' - '+literal(c)).join('');
 return 'select md5(coalesce(jsonb_agg('+row+' order by ('+row+")::text),'[]'::jsonb)::text) from "+identifier(schema)+'.'+identifier(table)+' t';
};
function authInsert(table,columns,rows){
 const names=columns.map(identifier).join(',');
 return 'insert into auth.'+identifier(table)+' ('+names+') select '+names+' from jsonb_populate_recordset(null::auth.'+identifier(table)+','+literal(JSON.stringify(rows))+'::jsonb);';
}
const emptyGuard=`select pg_catalog.pg_advisory_xact_lock(725492812);
do $leadly_guard$ begin
 if exists(select 1 from auth.users) or exists(select 1 from auth.identities) or exists(select 1 from auth.sessions)
  or exists(select 1 from storage.objects) or exists(select 1 from storage.buckets)
  or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f','S'))
  or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'))
  or exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and not exists(select 1 from pg_depend d where d.classid='pg_type'::regclass and d.objid=t.oid and d.deptype='e'))
 then raise exception 'recovery_target_not_empty'; end if;
end $leadly_guard$;`;

function buildPlan(source){
 const tables=JSON.parse(source.sql("select coalesce(json_agg(relname order by relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'"));
 if(!tables.includes('profiles')||!tables.includes('opportunities'))throw new Error('expected_application_schema_required');
 const unsupported=Number(source.sql('select (select count(*) from auth.mfa_factors)+(select count(*) from auth.webauthn_credentials)+(select count(*) from auth.sso_providers)'));
 if(unsupported!==0)throw new Error('additional_auth_recovery_strategy_required');
 const auth={};
 for(const table of ['users','identities']){
  const columns=JSON.parse(source.sql("select json_agg(attname order by attnum) from pg_attribute where attrelid='auth."+table+"'::regclass and attnum>0 and not attisdropped and attgenerated=''"));
  const generated=JSON.parse(source.sql("select coalesce(json_agg(attname),'[]') from pg_attribute where attrelid='auth."+table+"'::regclass and attnum>0 and not attisdropped and attgenerated<>''"));
  const fields=columns.map(identifier).join(',');
  let rows=JSON.parse(source.sql('select coalesce(json_agg(t order by id),\'[]\') from (select '+fields+' from auth.'+identifier(table)+') t'));
  if(table==='users')rows=rows.map(sanitizeUser);
  const hash=source.sql("select md5(coalesce(jsonb_agg(r.value order by r.value::text),'[]'::jsonb)::text) from jsonb_array_elements("+literal(JSON.stringify(rows))+"::jsonb) r(value)");
  auth[table]={columns,generated,rows,hash};
 }
 const expected={};
 for(const table of tables){
  expected[table]={count:transientPublic.has(table)?0:Number(source.sql('select count(*) from public.'+identifier(table)))};
  if(!transientPublic.has(table)&&table!=='telegram_notification_settings')expected[table].hash=source.sql(hashQuery('public',table));
 }
 const pre=sqlFromDump(source.dump(['--schema=public','--section=pre-data']));
 const post=sqlFromDump(source.dump(['--schema=public','--section=post-data']));
 const data=sqlFromDump(source.dump(['--schema=public','--data-only','--inserts','--column-inserts','--rows-per-insert=100',...[...transientPublic].flatMap(t=>['--exclude-table-data=public.'+t])]));
 const triggers=JSON.parse(source.sql("select coalesce(json_agg(pg_get_triggerdef(t.oid,true) order by t.tgname),'[]') from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace where n.nspname='auth' and c.relname='users' and pn.nspname='public' and not t.tgisinternal"));
 // Qualify copied trigger functions using the source table-independent catalog.
 const triggerSQL=triggers.map(t=>t.replace(/EXECUTE FUNCTION ([a-z_][a-z0-9_]*)\(/,'EXECUTE FUNCTION public.$1(')+';').join('\n');
 const policies=JSON.parse(source.sql("select coalesce(json_agg(json_build_object('name',policyname,'table',tablename,'permissive',permissive,'roles',roles,'cmd',cmd,'using',qual,'check',with_check) order by tablename,policyname),'[]') from pg_policies where schemaname='storage'"));
 const policySQL=policies.map(p=>'CREATE POLICY '+identifier(p.name)+' ON storage.'+identifier(p.table)+' AS '+(p.permissive==='PERMISSIVE'?'PERMISSIVE':'RESTRICTIVE')+' FOR '+p.cmd+' TO '+p.roles.map(r=>r==='public'?'PUBLIC':identifier(r)).join(',')+(p.using?' USING ('+p.using+')':'')+(p.check?' WITH CHECK ('+p.check+')':'')+';').join('\n');
 const disabledFunctions=['leadly_enable_ten_minute_sync()','leadly_request_ingestion()'];
 const pause=disabledFunctions.map(f=>'REVOKE ALL ON FUNCTION public.'+f+' FROM PUBLIC,anon,authenticated,service_role;').join('\n')+'\nUPDATE public.telegram_notification_settings SET opportunities_enabled=false,tasks_enabled=false;';
 let sql='BEGIN;\nSET LOCAL statement_timeout=\'110s\';\nSET LOCAL lock_timeout=\'10s\';\nSET LOCAL timezone=\'UTC\';\nSET LOCAL standard_conforming_strings=on;\n'+emptyGuard+'\n'+pre+'\n'+authInsert('users',auth.users.columns,auth.users.rows)+'\n'+authInsert('identities',auth.identities.columns,auth.identities.rows)+'\n'+data+'\n'+post+'\n'+triggerSQL+'\n'+pause+'\nCOMMIT;';
 const checks=[];
 for(const [table,value] of Object.entries(expected))checks.push("(select jsonb_build_object('table',"+literal(table)+",'count',count(*)"+(value.hash?",'hash',("+hashQuery('public',table)+")":'')+') from public.'+identifier(table)+')');
 const verifySQL='select jsonb_build_object(\'tables\',jsonb_build_array('+checks.join(',')+"),'authUsers',(select count(*) from auth.users),'authIdentities',(select count(*) from auth.identities),'authUserHash',("+hashQuery('auth','users',auth.users.generated)+"),'authIdentityHash',("+hashQuery('auth','identities',auth.identities.generated)+"),'sessions',(select count(*) from auth.sessions),'oneTimeTokens',(select count(*) from auth.one_time_tokens),'activeNotifications',(select count(*) from public.telegram_notification_settings where opportunities_enabled or tasks_enabled),'rlsTables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),'authTriggers',(select count(*) from pg_trigger t where t.tgrelid='auth.users'::regclass and not t.tgisinternal)) as recovery_verification";
 const expectedVerification={tables:Object.entries(expected).map(([table,v])=>({table,count:v.count,...(v.hash?{hash:v.hash}:{})})),authUsers:auth.users.rows.length,authIdentities:auth.identities.rows.length,authUserHash:auth.users.hash,authIdentityHash:auth.identities.hash,sessions:0,oneTimeTokens:0,activeNotifications:0,rlsTables:tables.length,authTriggers:triggers.length};
 const assertSQL='DO $leadly_verify$ DECLARE r jsonb; BEGIN SELECT q.recovery_verification INTO r FROM ('+verifySQL+') q; IF r IS DISTINCT FROM '+literal(JSON.stringify(expectedVerification))+"::jsonb THEN RAISE EXCEPTION 'recovery_verification_failed'; END IF; END $leadly_verify$;";
 sql=sql.replace(/\nCOMMIT;$/,'\n'+assertSQL+"\nNOTIFY pgrst, 'reload schema';\nCOMMIT;");
 const summary={targetRef:TARGET,sourceRef:SOURCE,publicTables:tables.length,authUsers:auth.users.rows.length,authIdentities:auth.identities.rows.length,customAuthTriggers:triggers.length,storagePolicies:policies.length,excludedPublicTables:[...transientPublic],sqlBytes:Buffer.byteLength(sql),sqlSha256:crypto.createHash('sha256').update(sql).digest('hex'),oldAuthSessionsCopied:false,notificationsEnabled:false,managedDDLReplaced:false,managedDefaultPrivilegesPreserved:true};
 return {sql,verifySQL,expected,auth,policySQL,summary,storagePath:source.storagePath};
}
function verifyRestored(plan,rows){
 const r=rows?.length===1&&rows[0].recovery_verification;
 if(!r||r.authUsers!==plan.summary.authUsers||r.authIdentities!==plan.summary.authIdentities||r.authUserHash!==plan.auth.users.hash||r.authIdentityHash!==plan.auth.identities.hash||r.sessions!==0||r.oneTimeTokens!==0||r.activeNotifications!==0||r.rlsTables!==plan.summary.publicTables||r.authTriggers!==plan.summary.customAuthTriggers||r.tables?.length!==plan.summary.publicTables)throw new Error('recovery_verification_failed');
 const seen=new Set();for(const row of r.tables){const e=plan.expected[row.table];if(!e||seen.has(row.table)||row.count!==e.count||(e.hash&&row.hash!==e.hash))throw new Error('recovery_data_verification_failed');seen.add(row.table);}
 return {verified:true,publicTables:r.tables.length,hashVerifiedTables:r.tables.filter(x=>plan.expected[x.table].hash).length,authUsers:r.authUsers,authIdentities:r.authIdentities,oldSessions:0,notificationsEnabled:false};
}
module.exports={TARGET,SOURCE,targetGuard,managementQuery,sqlFromDump,sanitizeUser,hashQuery,buildPlan,verifyRestored,emptyGuard};
