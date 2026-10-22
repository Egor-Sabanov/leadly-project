const fs=require('node:fs');
const path=require('node:path');
const {TARGET,targetGuard,managementQuery,buildPlan,verifyRestored}=require('./hosted-restore.cjs');

async function executeRecoveryDatabase({ref,token,source,nativeProof,reportFile}){
 targetGuard(ref);
 if(!reportFile||!path.isAbsolute(reportFile)||fs.existsSync(reportFile))throw new Error('new_private_recovery_report_required');
 const plan=buildPlan(source);
 if(nativeProof?.completed!==true||nativeProof?.cleaned!==true||nativeProof.plan?.sqlSha256!==plan.summary.sqlSha256||nativeProof.checks?.length<6)throw new Error('matching_native_recovery_proof_required');
 if(plan.summary.storagePolicies!==0)throw new Error('storage_policy_restore_requires_review');
 const query=(sql,readOnly=true)=>managementQuery({ref,token,query:sql,readOnly});
 const inventory=await query(fs.readFileSync(path.join(__dirname,'../../supabase/ops/inspect-recovery-target.sql'),'utf8'));
 const state=inventory?.length===1&&inventory[0].recovery_target_inventory;
 if(!state||state.authUsers!==0||state.storageObjects!==0||state.publicObjects?.length!==0)throw new Error('recovery_target_not_empty');
 const shapeSQL=fs.readFileSync(path.join(__dirname,'recovery-shape.sql'),'utf8');
 const shapeRows=await query(shapeSQL),shape=shapeRows?.length===1&&shapeRows[0].recovery_shape;
 const sourceShape=JSON.parse(source.sql(shapeSQL));
 if(!shape||shape.publicTables?.length!==0||shape.publicFunctions!==0)throw new Error('recovery_target_not_empty');
 for(const field of ['constraints','defaults','managedFunctions'])if(JSON.stringify(shape[field])!==JSON.stringify(sourceShape[field]))throw new Error('managed_recovery_shape_differs');
 const expectedTriggers=sourceShape.triggers.filter(t=>t.functionSchema!=='public');
 if(JSON.stringify(shape.triggers)!==JSON.stringify(expectedTriggers))throw new Error('managed_recovery_triggers_differ');
 const report={targetRef:TARGET,productionWritten:false,startedAt:new Date().toISOString(),plan:plan.summary,preflightVerified:true,sqlCommitted:false,verification:null};
 const save=()=>{fs.writeFileSync(reportFile,JSON.stringify(report,null,2),{mode:0o600});};
 // Save intent before sending. Never automatically replay an ambiguous write.
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
 try{
  await query(plan.sql,false);
  report.sqlCommitted=true;save();
  // SELECT only, using postgres so the owner's verification is not filtered by
  // application RLS or the separate Management read-only role's table grants.
  report.verification=verifyRestored(plan,await query(plan.verifySQL,false));
  const afterRows=await query(shapeSQL),after=afterRows?.[0]?.recovery_shape;
  for(const field of ['constraints','defaults','managedFunctions'])if(JSON.stringify(after?.[field])!==JSON.stringify(shape[field]))throw new Error('managed_shape_changed_after_restore');
  if(JSON.stringify(after.triggers.filter(t=>t.functionSchema!=='public'))!==JSON.stringify(shape.triggers))throw new Error('managed_triggers_changed_after_restore');
  report.managedShapePreserved=true;report.finishedAt=new Date().toISOString();save();
  return report;
 }catch(error){report.error=/^[a-z0-9_]+$/.test(error.message)?error.message:'recovery_transfer_failed';report.requiresReadCheck=true;save();throw error;}
}
module.exports={executeRecoveryDatabase};
