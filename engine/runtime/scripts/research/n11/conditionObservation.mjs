/** One-shot source-bound condition witness acquisition; no truth/independence acceptance. */
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resourceMode,resourceDeclaration} from './resourceProtocol.mjs';
import {inspectResourceConditionAcquisition,resourceObservationArtifact} from './resourceReceipt.mjs';
import {conditionVariant,CONDITION_PROTOCOL,CONDITION_MARKER} from './conditionProtocol.mjs';
import {sourceReceipt,freezeSourceFiles} from './rawObservation.mjs';
import {runNativeBrowserAcceptance} from '../n10/nativeBrowserAcceptance.mjs';
import {inspectConditionAcquisition} from './conditionReceipt.mjs';
import {exportAcquiredPairedPhases} from './pairedObservation.mjs';
const runtime=fileURLToPath(new URL('../../../',import.meta.url)),json=v=>JSON.stringify(v,null,2)+'\n',sha=b=>createHash('sha256').update(b).digest('hex');
function options(args,keys){const result={};for(let i=0;i<args.length;i+=2){if(!keys.includes(args[i])||Object.hasOwn(result,args[i])||!args[i+1])throw Error('explicit condition arguments required');result[args[i]]=args[i+1];}if(Object.keys(result).length!==keys.length)throw Error('explicit condition arguments required');return result;}
async function canonicalPlan(image,id,revision,condition,resource=false){
 if(typeof resource!=='boolean')throw Error('typed resource variant required');
 const variant=conditionVariant(condition);
 if(!/^sha256:[a-f0-9]{64}$/.test(image)||!/^n11-raw-[a-z0-9-]{1,40}$/.test(id)||!/^[a-f0-9]{40}$/.test(revision))throw Error('invalid condition plan');
 const sources=await sourceReceipt();
 return {schema_version:resource?'n11-contained-resource-condition-plan-v1':'n11-contained-condition-plan-v1',acquisition_id:id,image,core_revision:revision,
  producer_revision:execFileSync('git',['rev-parse','HEAD'],{cwd:runtime,encoding:'utf8'}).trim(),source_sha256:sources,source_manifest_hash:'sha256:'+sha(json(sources)),
  mode:resource?resourceMode(condition):'engineering-n11-condition-'+condition,observations:1,phases:['degraded','relief','recovery'],target_fps:[30,24,30],action_duration_ms:5000,browser_samples_per_phase:4,interval_ms:1000,
  temporal_contract:'source_local_stable_phase_v1',condition:{method:CONDITION_PROTOCOL,name:condition,recipe:CONDITION_MARKER},
  fault:{method:'fixed_owned_condition_v1',delay_us:variant.delay,workers:variant.pressureWorkers,maximum_active_ms:20000,child_failsafe_ms:40000,native_reference_ms:2000,establishment_ms:1000},
  ...(resource?{resources:resourceDeclaration()}:{}),
  labels:'unavailable',retry_allowed:false,scope:resource?'engineering_resource_observation_no_truth_or_recognition_acceptance':'engineering_condition_witness_no_truth_or_dose_transfer_acceptance'};
}
async function readPlan(file){
 const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const stat=await handle.stat();if(!stat.isFile()||stat.size>1024*1024)throw Error('bounded condition plan required');const buffer=Buffer.alloc(stat.size+1),read=await handle.read(buffer,0,buffer.length,0);if(read.bytesRead!==stat.size)throw Error('condition plan changed');return buffer.subarray(0,stat.size);}finally{await handle.close();}
}
export async function prepareConditionPlan(args,{resource=false}={}){
 const o=options(args,['--image','--acquisition-id','--core-revision','--condition','--output']);
 const plan=await canonicalPlan(o['--image'],o['--acquisition-id'],o['--core-revision'],o['--condition'],resource);
 await fs.writeFile(o['--output'],json(plan),{flag:'wx',mode:0o600});return plan;
}
export async function acquireConditionPlan(args,{resource=false,acquire=runNativeBrowserAcceptance,exportPhases=exportAcquiredPairedPhases}={}){
 const o=options(args,['--plan','--output-directory']),bytes=await readPlan(o['--plan']),plan=JSON.parse(bytes);
 const expected=await canonicalPlan(plan.image,plan.acquisition_id,plan.core_revision,plan.condition?.name,resource);
 if(bytes.toString()!==json(plan)||json(plan)!==json(expected))throw Error('changed condition source/plan');
 const directory=path.resolve(o['--output-directory']);await fs.mkdir(directory,{mode:0o700});
 await fs.writeFile(path.join(directory,'plan.json'),bytes,{flag:'wx',mode:0o600});let acquisition;
 try{
  await fs.writeFile(path.join(path.dirname(path.resolve(o['--plan'])),plan.acquisition_id+'.attempt.json'),json({plan_sha256:sha(bytes),output_directory:directory}),{flag:'wx',mode:0o600});
  await freezeSourceFiles(directory,plan.source_sha256);
  acquisition=await acquire(plan.image,plan.mode,{comparisonCaseId:plan.acquisition_id});
  await fs.writeFile(path.join(directory,'acquisition.json'),json(acquisition),{flag:'wx',mode:0o600});
  const receipt=resource?inspectResourceConditionAcquisition(acquisition,{condition:plan.condition.name}):inspectConditionAcquisition(acquisition,{condition:plan.condition.name});
  await fs.writeFile(path.join(directory,'control-receipt.json'),json(receipt),{flag:'wx',mode:0o600});
  if(resource)await fs.writeFile(path.join(directory,'resource-observation.json'),json(resourceObservationArtifact(receipt,'sha256:'+sha(json(acquisition)))),{flag:'wx',mode:0o600});
  await exportPhases(directory,acquisition,plan);
  if(json(await sourceReceipt())!==json(plan.source_sha256))throw Error('condition source changed during acquisition');
  return directory;
 }catch(error){
  if(!acquisition)await fs.writeFile(path.join(directory,'acquisition.json'),json(error.acquisition||{status:'failed',failure:'setup_unavailable',live_authority:false}),{flag:'wx',mode:0o600});
  await fs.writeFile(path.join(directory,'failure.json'),json({status:'failed',detail:String(error.message).split('\n')[0].slice(0,512),live_authority:false}),{flag:'wx',mode:0o600});throw error;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv[2]==='prepare')await prepareConditionPlan(process.argv.slice(3));else if(process.argv[2]==='acquire')await acquireConditionPlan(process.argv.slice(3));else throw Error('explicit prepare/acquire required');}
 catch{console.error('error: contained condition witness failed; retain allocated evidence');process.exitCode=1;}
}
