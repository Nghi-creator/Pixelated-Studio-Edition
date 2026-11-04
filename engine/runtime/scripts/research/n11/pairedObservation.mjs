/** Source-bound one-shot engineering paired acquisition; no accepted labels. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {sourceReceipt,freezeSourceFiles} from './rawObservation.mjs';
import {exportObservedPhase} from './rawObservationExport.mjs';
import {runNativeBrowserAcceptance} from '../n10/nativeBrowserAcceptance.mjs';
import {inspectPairedAcquisition} from './pairedObservationReceipt.mjs';
import {inspectPacingAcquisition} from './pacingReceipt.mjs';
import {inspectContentionAcquisition} from './contentionReceipt.mjs';
const runtime=fileURLToPath(new URL('../../../',import.meta.url));
const json=v=>JSON.stringify(v,null,2)+'\n';
const sha=v=>createHash('sha256').update(v).digest('hex');
function argsMap(args,keys){const result={};for(let i=0;i<args.length;i+=2){
  if(!keys.includes(args[i])||Object.hasOwn(result,args[i])||!args[i+1])throw Error('explicit paired arguments required');
  result[args[i]]=args[i+1];}if(Object.keys(result).length!==keys.length)throw Error('explicit paired arguments required');return result;}
async function canonicalPlan(image,id,revision,contention=false,pacing=false,contrast=false){
  if([contention,pacing,contrast].some(v=>typeof v!=='boolean')||[contention,pacing,contrast].filter(Boolean).length>1)throw Error('one closed paired fixture required');
  if(!/^sha256:[a-f0-9]{64}$/.test(image)||!/^n11-raw-[a-z0-9-]{1,40}$/.test(id)||!/^[a-f0-9]{40}$/.test(revision))throw Error('invalid paired plan');
  const sources=await sourceReceipt();
  const plan={schema_version:contrast?'n11-contained-pacing-contrast-plan-v1':pacing?'n11-contained-pacing-plan-v1':contention?'n11-contained-contention-plan-v1':'n11-contained-paired-plan-v1',acquisition_id:id,image,core_revision:revision,
    producer_revision:execFileSync('git',['rev-parse','HEAD'],{cwd:runtime,encoding:'utf8'}).trim(),
    source_sha256:sources,source_manifest_hash:'sha256:'+sha(json(sources)),
    mode:contrast?'engineering-n11-pacing-contrast':pacing?'engineering-n11-pacing-paired':contention?'engineering-n11-contention-paired':'engineering-n11-paired-observation',observations:1,phases:['degraded','relief','recovery'],
    target_fps:[30,24,30],action_duration_ms:5000,browser_samples_per_phase:4,interval_ms:1000,
    temporal_contract:'source_local_stable_phase_v1',fault:'none',labels:'unavailable',retry_allowed:false,
    scope:'engineering_control_integration_no_fault_no_label_no_empirical_acceptance'};
  if(contention){plan.fault={method:'owned_cpu_pressure_v1',workers:2,maximum_active_ms:20000,child_failsafe_ms:40000,
    native_reference_ms:2000,establishment_ms:1000};plan.scope='engineering_contention_feasibility_no_accepted_label_no_empirical_acceptance';}
  if(pacing){plan.fault={method:'owned_identity_pacing_v1',delay_us:50000,maximum_active_ms:20000,native_reference_ms:2000,establishment_ms:1000};plan.scope='engineering_pacing_feasibility_no_accepted_label_no_empirical_acceptance';}
  if(contrast){
    if(contention||pacing)throw Error('one closed paired fixture required');
    plan.fault={method:'owned_identity_pacing_contrast_v1',delay_us:37500,maximum_active_ms:20000,native_reference_ms:2000,establishment_ms:1000};
    plan.contrast={method:'serial_delay_envelope_v1',ceiling:{numerator:80,denominator:3},initial_native_above_target:true,relief_native_below_initial:true,independent_n3_check_required:true,native_counter_read_method:'native-counter-read-brackets-v1'};
    plan.scope='engineering_pacing_contrast_no_accepted_label_no_empirical_acceptance';
  }
  return plan;
}
export async function preparePairedPlan(args,{contention=false,pacing=false,contrast=false}={}){
  const o=argsMap(args,['--image','--acquisition-id','--core-revision','--output']);
  const plan=await canonicalPlan(o['--image'],o['--acquisition-id'],o['--core-revision'],contention,pacing,contrast);
  await fs.writeFile(o['--output'],json(plan),{flag:'wx',mode:0o600});return plan;
}
export async function acquirePairedPlan(args){
  const o=argsMap(args,['--plan','--output-directory']);
  const bytes=await fs.readFile(o['--plan']);if(bytes.length>1024*1024)throw Error('paired plan budget');
  const plan=JSON.parse(bytes),expected=await canonicalPlan(plan.image,plan.acquisition_id,plan.core_revision,plan.schema_version==='n11-contained-contention-plan-v1',plan.schema_version==='n11-contained-pacing-plan-v1',plan.schema_version==='n11-contained-pacing-contrast-plan-v1');
  if(bytes.toString()!==json(plan)||json(plan)!==json(expected))throw Error('paired source/plan mismatch');
  const directory=path.resolve(o['--output-directory']);await fs.mkdir(directory,{mode:0o700});
  await fs.writeFile(path.join(directory,'plan.json'),bytes,{flag:'wx',mode:0o600});
  let acquisition;
  try{
    await fs.writeFile(path.join(path.dirname(path.resolve(o['--plan'])),plan.acquisition_id+'.attempt.json'),
      json({plan_sha256:sha(bytes),output_directory:directory}),{flag:'wx',mode:0o600});
    await freezeSourceFiles(directory,plan.source_sha256);
    acquisition=await runNativeBrowserAcceptance(plan.image,plan.mode,{comparisonCaseId:plan.acquisition_id});
    await fs.writeFile(path.join(directory,'acquisition.json'),json(acquisition),{flag:'wx',mode:0o600});
    const receipt=plan.schema_version==='n11-contained-pacing-contrast-plan-v1'?inspectPacingAcquisition(acquisition,{contrast:true,requireNativeReads:true}):plan.schema_version==='n11-contained-pacing-plan-v1'?inspectPacingAcquisition(acquisition):plan.schema_version==='n11-contained-contention-plan-v1'?inspectContentionAcquisition(acquisition):inspectPairedAcquisition(acquisition);
    await fs.writeFile(path.join(directory,'control-receipt.json'),json(receipt),{flag:'wx',mode:0o600});
    for(const raw of acquisition.paired_observation.phases){
      const phase={status:'passed',method:'n11-contained-paired-phase-v1',role:'engineering_pair_phase_no_label',
        browser:acquisition.browser,native_receipt_sha256:'sha256:'+sha(json(acquisition)),raw_observation:raw,
        priming:acquisition.paired_observation.priming.find(p=>p.phase===raw.phase)};
      const phaseDirectory=path.join(directory,raw.phase);await fs.mkdir(phaseDirectory,{mode:0o700});
      await fs.writeFile(path.join(phaseDirectory,'acquisition.json'),json(phase),{flag:'wx',mode:0o600});
      const exported=await exportObservedPhase(runtime,phase,plan);
      for(const [name,data] of [['bundle.tar',exported.archive],['context.json',json(exported.context)],
        ['export.json',json({excluded_engine_snapshots:exported.excluded_engine_snapshots,clocks:exported.clocks})]])
        await fs.writeFile(path.join(phaseDirectory,name),data,{flag:'wx',mode:0o600});
    }
    if(json(await sourceReceipt())!==json(plan.source_sha256))throw Error('paired source changed during acquisition');
    return directory;
  }catch(error){
    if(!acquisition)await fs.writeFile(path.join(directory,'acquisition.json'),json(error.acquisition||{status:'failed',failure:'setup_unavailable',live_authority:false}),{flag:'wx',mode:0o600});
    await fs.writeFile(path.join(directory,'failure.json'),json({status:'failed',detail:String(error.message).split('\n')[0].slice(0,512),live_authority:false}),{flag:'wx',mode:0o600});throw error;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv[2]==='prepare-pacing-contrast')await preparePairedPlan(process.argv.slice(3),{contrast:true});
    else if(process.argv[2]==='prepare-pacing')await preparePairedPlan(process.argv.slice(3),{pacing:true});
    else if(process.argv[2]==='prepare-contention')await preparePairedPlan(process.argv.slice(3),{contention:true});
    else if(process.argv[2]==='prepare')await preparePairedPlan(process.argv.slice(3));
    else if(process.argv[2]==='acquire')await acquirePairedPlan(process.argv.slice(3));else throw Error('explicit prepare/acquire required');}
  catch{console.error('error: contained paired acquisition failed; retain allocated evidence');process.exitCode=1;}
}
