/** Synthetic one-session workflows. No Docker/native acquisition. */
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {runCombinedStudy,allocateCombinedStudy} from '../n11/combinedResourceStudy.mjs';
const json=v=>JSON.stringify(v,null,2)+'\n',sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');

async function fixture(t,{available=false,failAt=null,fitText=null,scoreText=null,failFit=false,failScore=false}={}) {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'combined-study-test-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const sources=async()=>({fake:'a'.repeat(64)}),sourceHash=sha(json(await sources()));
 const blocks=[],sessions=[];const conditions=['no_injected_fault','owned_identity_delay','owned_cpu_pressure'];
 for(let b=0;b<12;b++) {
  const block_id='block-'+b,role=b<6?'training':'evaluation';const acquisition_ids={},slots=[];
  const plans=path.join(directory,'plans',block_id);await fs.mkdir(plans,{recursive:true});
  for(const [ordinal,condition]of conditions.entries()) {
   const acquisition_id=`n11-raw-cs-${b}-${ordinal}`,plan=path.join(plans,acquisition_id+'.json');
   await fs.writeFile(plan,json({acquisition_id,condition:{name:condition}}));acquisition_ids[condition]=acquisition_id;
   slots.push({ordinal,condition,acquisition_id,plan,plan_sha256:sha(await fs.readFile(plan)),output:path.join(directory,'sessions',block_id,'condition-'+ordinal)});
  }
  const block={block_id,role,host_id:'host',session_id:'one-session',condition_order:conditions,acquisition_ids};
  blocks.push(block);sessions.push({...block,slots});
 }
 const runnerTool=fileURLToPath(new URL('../n11/combinedResourceStudy.mjs',import.meta.url));
 const protocol={protocol_id:'synthetic',blocks,tool_hashes:{runner:sha(await fs.readFile(runnerTool)),processor:sha('synthetic processor')}};const protocolFile=path.join(directory,'protocol.json');await fs.writeFile(protocolFile,json(protocol));
 const dep=path.join(directory,'processor.py');await fs.writeFile(dep,'synthetic processor');
 const allocation={source_manifest_hash:sourceHash,core_directory:directory,protocol_file_sha256:sha(await fs.readFile(protocolFile)),dependency_files:{[dep]:sha(await fs.readFile(dep))},verification_command:['verify'],sessions};
 const allocationFile=path.join(directory,'allocation.json');await fs.writeFile(allocationFile,json(allocation));
 const tool=fileURLToPath(new URL('../n11/combinedResourceStudy.mjs',import.meta.url));
 await fs.writeFile(path.join(directory,'combined-study-runner.json'),json({method_release:'n11-combined-resource-study-protocol-v1',allocation_sha256:sha(await fs.readFile(allocationFile)),tool_sha256:sha(await fs.readFile(tool)),processor:dep,python:'python'}));
 const contextFile=path.join(directory,'context.json');await fs.writeFile(contextFile,json({session_id:'one-session',host_id:'host',session_components:1,independent_support_groups:0,documented_by:'synthetic-test',observed_context:{synthetic:true}}));
 const calls=[];let fitCalled=false,scoreCount=0;
 const acquire=async args=>{calls.push(args[3]);if(calls.length===failAt)throw Error('synthetic acquisition failure');await fs.mkdir(args[3]);};
 const command=args=>{
  if(args[2]==='inspect')return json({state:'reviewed_combined_study_declarations_complete'});
  if(args[2]==='fit'){if(failFit)throw Error('synthetic fit failure');assert.equal(calls.length,18);fitCalled=true;return fitText || json({calibration:{state:available?'candidate_calibration_available':'unavailable',reason_codes:available?[]:['calibration_folds_not_all_uniquely_correct']}});}
  if(args[2]==='score'){if(failScore)throw Error('synthetic score failure');assert.ok(fitCalled);assert.ok(!args.includes('--truth'));assert.ok(args.includes('--case'));assert.ok(!args.includes('--response'));scoreCount++;return scoreText || json({predicted_condition:'no_injected_fault'});}
  return json({verified:true});
 };
 return {directory,contextFile,calls,dependencies:{acquire,sources,command},scores:()=>scoreCount};
}

test('unavailable fitting leaves every evaluation acquisition untouched',async t=>{
 const f=await fixture(t);const result=await runCombinedStudy(f,f.dependencies);
 assert.equal(f.calls.length,18);assert.equal(result.state,'calibration_unavailable_evaluation_unstarted');
 assert.equal(result.unstarted_acquisition_ids.length,18);assert.equal(f.scores(),0);
 assert.equal(result.session_components,1);assert.equal(result.independent_support_groups,0);
 await assert.rejects(runCombinedStudy(f,f.dependencies));assert.equal(f.calls.length,18);
});
test('available fitting is frozen before any truth-free query scoring',async t=>{
 const f=await fixture(t,{available:true});const result=await runCombinedStudy(f,f.dependencies);
 assert.equal(result.state,'complete_within_session_evaluation');assert.equal(f.calls.length,36);
 assert.equal(f.scores(),18);assert.equal(result.unstarted_acquisition_ids.length,0);
 const freeze=JSON.parse(await fs.readFile(path.join(f.directory,'training-freeze.json')));
 assert.equal(freeze.evaluation_acquisitions_started,0);assert.equal(result.empirical_acceptance,false);
});
test('acquisition failure stops the entire suffix without fitting or replacement',async t=>{
 const f=await fixture(t,{failAt:2});await assert.rejects(runCombinedStudy(f,f.dependencies),/synthetic acquisition failure/);
 assert.equal(f.calls.length,2);assert.equal(f.scores(),0);
 const result=JSON.parse(await fs.readFile(path.join(f.directory,'session-result.json')));
 assert.equal(result.state,'failed_stop');assert.equal(result.rows.length,1);assert.equal(result.unstarted_acquisition_ids.length,34);
 await assert.rejects(runCombinedStudy(f,f.dependencies));assert.equal(f.calls.length,2);
});
test('processor bytes preserve signed numeric identities across the Python/JavaScript boundary',async t=>{
 const fitText='{"training":{"opaque":{"integralFloat":6.0,"negativeZero":-0.0,"small":1e-05}},"calibration":{"state":"candidate_calibration_available","reason_codes":[]}}\n';
 const scoreText='{"state":"abstain","predicted_condition":null,"runner_up_gap":0.0}\n';
 const f=await fixture(t,{available:true,fitText,scoreText});await runCombinedStudy(f,f.dependencies);
 assert.equal(await fs.readFile(path.join(f.directory,'training-fit.json'),'utf8'),fitText);
 const freeze=JSON.parse(await fs.readFile(path.join(f.directory,'training-freeze.json')));
 assert.equal(freeze.sha256,sha(fitText));
 for(let b=6;b<12;b++)for(let ordinal=0;ordinal<3;ordinal++) {
  assert.equal(await fs.readFile(path.join(f.directory,'sessions','block-'+b,'condition-'+ordinal,'prediction.json'),'utf8'),scoreText);
 }
});

test('fit failure leaves every query explicitly unstarted, not a failed acquisition',async t=>{
 const f=await fixture(t,{failFit:true});await assert.rejects(runCombinedStudy(f,f.dependencies),/synthetic fit failure/);
 const result=JSON.parse(await fs.readFile(path.join(f.directory,'session-result.json')));
 assert.equal(f.calls.length,18);assert.equal(result.failed_acquisition_id,null);assert.equal(result.failed_stage,'fit');assert.equal(result.unstarted_acquisition_ids.length,18);
});
test('score failure retains attempted query and stops remaining suffix',async t=>{
 const f=await fixture(t,{available:true,failScore:true});await assert.rejects(runCombinedStudy(f,f.dependencies),/synthetic score failure/);
 const result=JSON.parse(await fs.readFile(path.join(f.directory,'session-result.json')));
 assert.equal(f.calls.length,19);assert.equal(result.failed_stage,'score');assert.ok(result.failed_acquisition_id);assert.equal(result.unstarted_acquisition_ids.length,17);
});
test('pending protocol cannot allocate a directory or call plan preparation',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'combined-draft-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const processor=path.join(directory,'processor.py'),verifier=path.join(directory,'verifier.py'),supervisor=path.join(directory,'supervisor.py');
 for(const file of [processor,verifier,supervisor])await fs.writeFile(file,'synthetic tool');
 const tool=fileURLToPath(new URL('../n11/combinedResourceStudy.mjs',import.meta.url));
 const tool_hashes={processor:sha(await fs.readFile(processor)),verifier:sha(await fs.readFile(verifier)),runner:sha(await fs.readFile(tool)),supervisor:sha(await fs.readFile(supervisor))};
 const protocolFile=path.join(directory,'protocol.json');await fs.writeFile(protocolFile,json({review:{state:'pending'},tool_hashes}));
 const target=path.join(directory,'allocation');let prepared=0;
 await assert.rejects(allocateCombinedStudy({processor,verifier,supervisor,protocolFile,directory:target,python:'python',coreDirectory:directory,dependencyFiles:{[processor]:tool_hashes.processor,[verifier]:tool_hashes.verifier,[tool]:tool_hashes.runner,[supervisor]:tool_hashes.supervisor}},
  {command:()=>json({state:'unavailable',reason_codes:['protocol_review_pending']}),prepare:async()=>{prepared++;}}));
 assert.equal(prepared,0);await assert.rejects(fs.stat(target),{code:'ENOENT'});
});

test('reviewed synthetic allocation freezes exactly36 resource plans and runner pins',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'combined-allocation-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const processor=path.join(directory,'processor.py'),verifier=path.join(directory,'verifier.py'),supervisor=path.join(directory,'supervisor.py');
 for(const file of [processor,verifier,supervisor])await fs.writeFile(file,'synthetic tool');
 const tool=fileURLToPath(new URL('../n11/combinedResourceStudy.mjs',import.meta.url));
 const dependencyFiles={};for(const file of [processor,verifier,supervisor,tool])dependencyFiles[file]=sha(await fs.readFile(file));
 const tool_hashes={processor:dependencyFiles[processor],verifier:dependencyFiles[verifier],runner:dependencyFiles[tool],supervisor:dependencyFiles[supervisor]};
 const sourceFiles={fake:'a'.repeat(64)},source_manifest_hash=sha(json(sourceFiles));
 const conditions=['no_injected_fault','owned_identity_delay','owned_cpu_pressure'];
 const blocks=Array.from({length:12},(_,i)=>({block_id:'block-'+i,role:i<6?'training':'evaluation',host_id:'host',session_id:'session',condition_order:conditions,acquisition_ids:Object.fromEntries(conditions.map((c,j)=>[c,`n11-raw-cs-${i}-${j}`]))}));
 const protocolFile=path.join(directory,'protocol.json');await fs.writeFile(protocolFile,json({protocol_id:'synthetic',tool_hashes,source_manifest_hash,image_sha256:'sha256:'+'b'.repeat(64),blocks}));
 const target=path.join(directory,'allocation');let prepared=0;
 const result=await allocateCombinedStudy({processor,verifier,supervisor,protocolFile,directory:target,python:process.execPath,coreRevision:'a'.repeat(40),coreDirectory:directory,verificationCommand:[process.execPath,verifier],dependencyFiles},
 {sources:async()=>sourceFiles,command:()=>json({state:'reviewed_combined_study_declarations_complete'}),prepare:async args=>{
  prepared++;const condition=args[7],plan={schema_version:'n11-contained-resource-condition-plan-v1',source_manifest_hash,condition:{name:condition}};await fs.writeFile(args[9],json(plan));return plan;
 }});
 assert.equal(prepared,36);assert.equal(result.sessions.length,12);assert.equal(result.acquisition_authority,false);
 const runner=JSON.parse(await fs.readFile(path.join(target,'combined-study-runner.json')));
 assert.equal(runner.method_release,'n11-combined-resource-study-protocol-v1');assert.equal(runner.tool_sha256,tool_hashes.runner);
 await assert.rejects(allocateCombinedStudy({processor,dependencyFiles}));assert.equal(prepared,36);
});
