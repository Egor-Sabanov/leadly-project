const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {exportStorage,segment}=require('./storage.cjs');
const {TARGET,targetGuard}=require('./hosted-restore.cjs');
function recoveryClient({ref,key,fetcher=fetch}){
 targetGuard(ref);if(!key)throw new Error('recovery_storage_credential_missing');
 const origin='https://'+TARGET+'.supabase.co';
 return createClient(origin,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.origin!==origin)throw new Error('unexpected_recovery_api_destination');
  return fetcher(input,{...init,redirect:'manual',signal:AbortSignal.timeout(30000)});
 }}});
}
async function restoreRecoveryStorage({ref,key,source,fetcher}){
 const client=recoveryClient({ref,key,fetcher});
 const buckets=JSON.parse(source.sql("select coalesce(json_agg(json_build_object('id',id,'public',public,'fileSizeLimit',file_size_limit,'allowedMimeTypes',allowed_mime_types) order by id),'[]') from storage.buckets"));
 const objects=JSON.parse(source.sql("select coalesce(json_agg(json_build_object('bucket',bucket_id,'name',name,'contentType',metadata->>'mimetype') order by bucket_id,name),'[]') from storage.objects"));
 if(buckets.some(b=>b.public))throw new Error('private_recovery_storage_required');
 const expected=objects.map(o=>{
  const pieces=['files',segment(o.bucket),...o.name.split('/').map(segment)];
  const file=path.resolve(source.storagePath,...pieces);
  if(!file.startsWith(path.resolve(source.storagePath)+path.sep)||!fs.statSync(file).isFile())throw new Error('invalid_recovery_file');
  const bytes=fs.readFileSync(file);
  return {...o,bytes,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 });
 const result=await client.storage.listBuckets();
 if(result.error||!Array.isArray(result.data))throw new Error('recovery_storage_access_failed');
 if(result.data.some(b=>!buckets.some(s=>s.id===b.id)))throw new Error('unexpected_recovery_bucket');
 for(const bucket of buckets){
  const existing=result.data.find(b=>b.id===bucket.id);
  if(existing){
   if(existing.public!==false||Number(existing.file_size_limit??0)!==Number(bucket.fileSizeLimit??0)||JSON.stringify(existing.allowed_mime_types??null)!==JSON.stringify(bucket.allowedMimeTypes??null))throw new Error('recovery_bucket_settings_differ');
  }else{
   const created=await client.storage.createBucket(bucket.id,{public:false,...(bucket.fileSizeLimit===null?{}:{fileSizeLimit:Number(bucket.fileSizeLimit)}),...(bucket.allowedMimeTypes===null?{}:{allowedMimeTypes:bucket.allowedMimeTypes})});
   if(created.error)throw new Error('recovery_bucket_create_failed');
  }
 }
 // A retry after an uncertain upload only accepts matching bytes; no overwrite.
 const beforeDir=path.join(source.work,'storage-before');fs.mkdirSync(beforeDir,{mode:0o700});
 const before=await exportStorage(client,beforeDir);
 for(const file of before.files){const wanted=expected.find(e=>e.bucket===file.bucket&&e.name===file.name);if(!wanted||wanted.size!==file.size||wanted.sha256!==file.sha256)throw new Error('unexpected_recovery_storage_object');}
 for(const file of expected){
  if(before.files.some(e=>e.bucket===file.bucket&&e.name===file.name))continue;
  const uploaded=await client.storage.from(file.bucket).upload(file.name,file.bytes,{contentType:file.contentType||'application/octet-stream',upsert:false});
  if(uploaded.error)throw new Error('recovery_storage_upload_outcome_requires_check');
 }
 const afterDir=path.join(source.work,'storage-after');fs.mkdirSync(afterDir,{mode:0o700});
 const after=await exportStorage(client,afterDir);
 if(after.files.length!==expected.length)throw new Error('recovery_storage_count_mismatch');
 for(const file of after.files){const wanted=expected.find(e=>e.bucket===file.bucket&&e.name===file.name);if(!wanted||wanted.size!==file.size||wanted.sha256!==file.sha256)throw new Error('recovery_storage_hash_mismatch');}
 return {verified:true,privateBuckets:buckets.length,files:expected.length,bytes:expected.reduce((n,f)=>n+f.size,0),hashVerified:true,overwrittenFiles:0};
}
module.exports={recoveryClient,restoreRecoveryStorage};
