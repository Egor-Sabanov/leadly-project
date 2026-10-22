const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {restore}=require('./backup.cjs');

// This helper only opens an isolated localhost database. Hosted writes have a
// separate, target-bound implementation; backup.cjs retains its localhost guard.
async function withRecoverySource(options,callback){
 const {archive,archiveSha256,privateKey,passphraseFile,pgBin,pgData,pgSocket,pgPort,logFile}=options;
 if(!archiveSha256||crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==archiveSha256)throw new Error('trusted_archive_hash_required');
 if(!Number.isInteger(pgPort)||pgPort<1024||pgPort>65535)throw new Error('isolated_postgres_port_required');
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'leadly-hosted-prepare-'));fs.chmodSync(work,0o700);
 const database='leadly_restore_hosted_'+crypto.randomBytes(8).toString('hex');
 const env={...process.env,PGHOST:'127.0.0.1',PGPORT:String(pgPort),PGUSER:os.userInfo().username,PGDATABASE:'postgres',PGPASSWORD:'',PGSSLMODE:'disable',LEADLY_PG_BIN:pgBin};
 for(const k of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS'])delete env[k];
 const command=(name,args,extra={})=>{
  const result=spawnSync(path.join(pgBin,name),args,{env,cwd:work,encoding:'utf8',timeout:180000,maxBuffer:128*1024*1024,...extra});
  if(result.error||result.status!==0){const error=new Error('recovery_local_tool_failed_'+name.replace(/[^a-z_]/g,''));error.sqlState=/ERROR:\s+([A-Z0-9]{5})\b/.exec(result.stderr||'')?.[1];error.permissionDetail=/ERROR:\s+(?:[A-Z0-9]{5}:\s+)?((?:permission denied|must be owner|must be member|must be superuser)[^\n]*)/.exec(result.stderr||'')?.[1]?.slice(0,180);throw error;}
  return result.stdout;
 };
 let started=false,created=false;const oldBin=process.env.LEADLY_PG_BIN;
 try{
  if(spawnSync(path.join(pgBin,'pg_ctl'),['-D',pgData,'status'],{encoding:'utf8'}).status!==0){command('pg_ctl',['-D',pgData,'-l',logFile,'-o','-h 127.0.0.1 -p '+pgPort+' -k '+pgSocket+' -c log_min_error_statement=panic -c log_error_verbosity=terse','start']);started=true;fs.chmodSync(logFile,0o600);}
  command('createdb',[database]);created=true;process.env.LEADLY_PG_BIN=pgBin;
  const storagePath=path.join(work,'verified-storage');
  const restored=await restore({databaseUrl:'postgres://'+encodeURIComponent(env.PGUSER)+'@127.0.0.1:'+pgPort+'/'+database,input:archive,privateKey,passphraseFile,destination:storagePath});
  const sourceEnv={...env,PGDATABASE:database};
  const sql=query=>command('psql',['-X','-v','ON_ERROR_STOP=1','-At'],{env:sourceEnv,input:query}).trim();
  const dump=args=>command('pg_dump',['--no-owner',...args,database],{env:sourceEnv});
  return await callback({work,database,env:sourceEnv,sql,dump,storagePath,restored,command});
 }finally{
  try{if(created)command('dropdb',[database]);}finally{
   try{if(started)command('pg_ctl',['-D',pgData,'-m','fast','stop']);}finally{
    fs.rmSync(work,{recursive:true,force:true});
    if(oldBin===undefined)delete process.env.LEADLY_PG_BIN;else process.env.LEADLY_PG_BIN=oldBin;
   }
  }
 }
}
module.exports={withRecoverySource};
