/** Explicit preallocated one-shot raw observation; never imports a live controller. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {researchSourceFiles} from '../n10/researchSources.mjs';
import {runNativeBrowserAcceptance} from '../n10/nativeBrowserAcceptance.mjs';
import {exportRawObservation} from './rawObservationExport.mjs';

const runtime=fileURLToPath(new URL('../../../',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
export async function sourceReceipt() {
  const files=(await researchSourceFiles(runtime)).map(n=>[n,path.join(runtime,n)]);
  for (const directory of ['dist/src','scripts/research/n11']) {
    for (const name of (await fs.readdir(path.join(runtime,directory),{recursive:true})).sort()) {
      if (/\.(js|mjs|cjs)$/.test(name)) files.push([directory+'/'+name,path.join(runtime,directory,name)]);
    }
  }
  const web=path.resolve(runtime,'../../apps/web/src');
  for (const name of (await fs.readdir(web,{recursive:true})).sort()) {
    if (/\.tsx?$/.test(name)) files.push(['web/src/'+name,path.join(web,name)]);
  }
  const receipt={};
  for (const [name,file] of files.sort(([a],[b])=>a.localeCompare(b))) receipt[name]=sha(await fs.readFile(file));
  return receipt;
}
async function freezeSourceFiles(directory, sources) {
  const web=path.resolve(runtime,'../../apps/web/src');
  for(const [name,expected] of Object.entries(sources)) {
    const source=name.startsWith('web/src/') ? path.join(web,name.slice(8)) : path.join(runtime,name);
    const bytes=await fs.readFile(source);
    if(sha(bytes)!==expected)throw Error('raw source changed before launch');
    const target=path.join(directory,'sources',name);
    await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
    await fs.writeFile(target,bytes,{flag:'wx',mode:0o600});
  }
}
function argumentsMap(args, allowed) {
  const result={};
  for(let i=0;i<args.length;i+=2){
    if(!allowed.includes(args[i])||args[i] in result||!args[i+1])throw Error('invalid raw arguments');
    result[args[i]]=args[i+1];
  }
  if(Object.keys(result).length!==allowed.length)throw Error('explicit raw arguments required');
  return result;
}
export async function prepareRawPlan(args) {
  const opts=argumentsMap(args,['--image','--acquisition-id','--core-revision','--output']);
  if(!/^sha256:[a-f0-9]{64}$/.test(opts['--image'])||!/^n11-raw-[a-z0-9-]{1,40}$/.test(opts['--acquisition-id'])||!/^[a-f0-9]{40}$/.test(opts['--core-revision'])) throw Error('invalid raw plan');
  const sources=await sourceReceipt();
  const plan={schema_version:'n11-contained-raw-plan-v1',acquisition_id:opts['--acquisition-id'],image:opts['--image'],
    core_revision:opts['--core-revision'],producer_revision:execFileSync('git',['rev-parse','HEAD'],{cwd:runtime,encoding:'utf8'}).trim(),
    source_sha256:sources,source_manifest_hash:'sha256:'+sha(json(sources)),mode:'n11-raw-observation',
    observations:1,browser_samples:8,interval_ms:1000,retry_allowed:false,labels:'unavailable',scope:'engineering_no_action_no_pair_no_empirical_acceptance'};
  await fs.writeFile(opts['--output'],json(plan),{flag:'wx',mode:0o600});return plan;
}
export async function acquireRawPlan(args) {
  const opts=argumentsMap(args,['--plan','--output-directory']);
  const bytes=await fs.readFile(opts['--plan']);if(bytes.length>1024*1024)throw Error('raw plan budget');
  const plan=JSON.parse(bytes);if(bytes.toString()!==json(plan))throw Error('canonical raw plan required');
  const sources=await sourceReceipt();
  const expected={schema_version:'n11-contained-raw-plan-v1',acquisition_id:plan.acquisition_id,image:plan.image,
    core_revision:plan.core_revision,producer_revision:plan.producer_revision,source_sha256:sources,source_manifest_hash:'sha256:'+sha(json(sources)),
    mode:'n11-raw-observation',observations:1,browser_samples:8,interval_ms:1000,retry_allowed:false,labels:'unavailable',scope:'engineering_no_action_no_pair_no_empirical_acceptance'};
  if(json(plan)!==json(expected)||!/^sha256:[a-f0-9]{64}$/.test(plan.image)||!/^n11-raw-[a-z0-9-]{1,40}$/.test(plan.acquisition_id)||!/^[a-f0-9]{40}$/.test(plan.producer_revision)||!/^[a-f0-9]{40}$/.test(plan.core_revision))throw Error('raw source/plan mismatch');
  const directory=path.resolve(opts['--output-directory']);
  await fs.mkdir(directory,{mode:0o700}); // Exclusive allocation; never delete a failed cohort.
  await fs.writeFile(path.join(directory,'plan.json'),bytes,{flag:'wx',mode:0o600});
  let acquisition;
  try {
    await fs.writeFile(path.join(path.dirname(path.resolve(opts['--plan'])),plan.acquisition_id+'.attempt.json'),json({plan_sha256:sha(bytes),output_directory:directory}),{flag:'wx',mode:0o600});
    await freezeSourceFiles(directory,sources);
    acquisition=await runNativeBrowserAcceptance(plan.image,plan.mode);
    await fs.writeFile(path.join(directory,'acquisition.json'),json(acquisition),{flag:'wx',mode:0o600});
    const exported=await exportRawObservation(runtime,acquisition,plan);
    await fs.writeFile(path.join(directory,'bundle.tar'),exported.archive,{flag:'wx',mode:0o600});
    await fs.writeFile(path.join(directory,'context.json'),json(exported.context),{flag:'wx',mode:0o600});
    await fs.writeFile(path.join(directory,'export.json'),json({excluded_engine_snapshots:exported.excluded_engine_snapshots,clocks:exported.clocks,live_authority:false}),{flag:'wx',mode:0o600});
    if(json(await sourceReceipt())!==json(sources))throw Error('raw source changed during acquisition');
    return directory;
  } catch(error) {
    if(!acquisition)await fs.writeFile(path.join(directory,'acquisition.json'),json(error.acquisition||{status:'failed',mode:plan.mode,live_authority:false,failure:'setup_unavailable'}),{flag:'wx',mode:0o600});
    await fs.writeFile(path.join(directory,'failure.json'),json({status:'failed',reason:'raw_observation_or_export_failed',detail:String(error.message).split('\n')[0].slice(0,512),live_authority:false}),{flag:'wx',mode:0o600});
    throw error;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv[2]==='prepare')await prepareRawPlan(process.argv.slice(3));
    else if(process.argv[2]==='acquire')await acquireRawPlan(process.argv.slice(3));
    else throw Error('use prepare or acquire');
  } catch {console.error('error: contained raw observation failed; retain any allocated evidence directory');process.exitCode=1;}
}
