/** Synthetic one-session workflows. No Docker/native acquisition. */
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {runWithinSession} from '../n11/withinSessionStudy.mjs';
const json=v=>JSON.stringify(v,null,2)+'\n',sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');

async function fixture(t,{available=false,failAt=null,fitText=null,scoreText=null}={}) {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'within-session-test-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const sources=async()=>({fake:'a'.repeat(64)}),sourceHash=sha(json(await sources()));
 const blocks=[],sessions=[];const conditions=['no_injected_fault','owned_identity_delay','owned_cpu_pressure'];
 for(let b=0;b<12;b++) {
  const block_id='block-'+b,role=b<6?'training':'evaluation';const acquisition_ids={},slots=[];
  const plans=path.join(directory,'plans',block_id);await fs.mkdir(plans,{recursive:true});
  for(const [ordinal,condition]of conditions.entries()) {
   const acquisition_id=`n11-raw-ss-${b}-${ordinal}`,plan=path.join(plans,acquisition_id+'.json');
   await fs.writeFile(plan,json({acquisition_id,condition:{name:condition}}));acquisition_ids[condition]=acquisition_id;
   slots.push({ordinal,condition,acquisition_id,plan,plan_sha256:sha(await fs.readFile(plan)),output:path.join(directory,'sessions',block_id,'condition-'+ordinal)});
  }
  const block={block_id,role,host_id:'host',session_id:'one-session',condition_order:conditions,acquisition_ids};
  blocks.push(block);sessions.push({...block,slots});
 }
 const protocol={protocol_id:'synthetic',blocks};const protocolFile=path.join(directory,'protocol.json');await fs.writeFile(protocolFile,json(protocol));
 const dep=path.join(directory,'processor.py');await fs.writeFile(dep,'synthetic processor');
 const allocation={source_manifest_hash:sourceHash,core_directory:directory,protocol_file_sha256:sha(await fs.readFile(protocolFile)),dependency_files:{[dep]:sha(await fs.readFile(dep))},verification_command:['verify'],sessions};
 const allocationFile=path.join(directory,'allocation.json');await fs.writeFile(allocationFile,json(allocation));
 const tool=fileURLToPath(new URL('../n11/withinSessionStudy.mjs',import.meta.url));
 await fs.writeFile(path.join(directory,'within-session-runner.json'),json({method_release:'n11-within-session-protocol-v1',allocation_sha256:sha(await fs.readFile(allocationFile)),tool_sha256:sha(await fs.readFile(tool)),processor:dep,python:'python'}));
 const contextFile=path.join(directory,'context.json');await fs.writeFile(contextFile,json({session_id:'one-session',host_id:'host',session_components:1,independent_support_groups:0,documented_by:'synthetic-test',observed_context:{synthetic:true}}));
 const calls=[];let fitCalled=false,scoreCount=0;
 const acquire=async args=>{calls.push(args[3]);if(calls.length===failAt)throw Error('synthetic acquisition failure');await fs.mkdir(args[3]);};
 const command=args=>{
  if(args[2]==='inspect')return json({state:'reviewed_within_session_declarations_complete'});
  if(args[2]==='fit'){assert.equal(calls.length,18);fitCalled=true;return fitText || json({calibration:{state:available?'experimental_calibration_available':'unavailable',reason_codes:available?[]:['calibration_folds_not_all_uniquely_correct']}});}
  if(args[2]==='score'){assert.ok(fitCalled);assert.ok(!args.includes('--truth'));scoreCount++;return scoreText || json({predicted_condition:'no_injected_fault'});}
  return json({verified:true});
 };
 return {directory,contextFile,calls,dependencies:{acquire,sources,command},scores:()=>scoreCount};
}

test('unavailable fitting leaves every evaluation acquisition untouched',async t=>{
 const f=await fixture(t);const result=await runWithinSession(f,f.dependencies);
 assert.equal(f.calls.length,18);assert.equal(result.state,'calibration_unavailable_evaluation_unstarted');
 assert.equal(result.unstarted_acquisition_ids.length,18);assert.equal(f.scores(),0);
 assert.equal(result.session_components,1);assert.equal(result.independent_support_groups,0);
 await assert.rejects(runWithinSession(f,f.dependencies));assert.equal(f.calls.length,18);
});
test('available fitting is frozen before any truth-free query scoring',async t=>{
 const f=await fixture(t,{available:true});const result=await runWithinSession(f,f.dependencies);
 assert.equal(result.state,'complete_within_session_evaluation');assert.equal(f.calls.length,36);
 assert.equal(f.scores(),18);assert.equal(result.unstarted_acquisition_ids.length,0);
 const freeze=JSON.parse(await fs.readFile(path.join(f.directory,'training-freeze.json')));
 assert.equal(freeze.evaluation_acquisitions_started,0);assert.equal(result.empirical_acceptance,false);
});
test('acquisition failure stops the entire suffix without fitting or replacement',async t=>{
 const f=await fixture(t,{failAt:2});await assert.rejects(runWithinSession(f,f.dependencies),/synthetic acquisition failure/);
 assert.equal(f.calls.length,2);assert.equal(f.scores(),0);
 const result=JSON.parse(await fs.readFile(path.join(f.directory,'session-result.json')));
 assert.equal(result.state,'failed_stop');assert.equal(result.rows.length,1);assert.equal(result.unstarted_acquisition_ids.length,34);
 await assert.rejects(runWithinSession(f,f.dependencies));assert.equal(f.calls.length,2);
});
test('processor bytes preserve signed numeric identities across the Python/JavaScript boundary',async t=>{
 const fitText='{"training":{"opaque":{"integralFloat":6.0,"negativeZero":-0.0,"small":1e-05}},"calibration":{"state":"experimental_calibration_available","reason_codes":[]}}\n';
 const scoreText='{"state":"abstain","predicted_condition":null,"runner_up_gap":0.0}\n';
 const f=await fixture(t,{available:true,fitText,scoreText});await runWithinSession(f,f.dependencies);
 assert.equal(await fs.readFile(path.join(f.directory,'training-fit.json'),'utf8'),fitText);
 const freeze=JSON.parse(await fs.readFile(path.join(f.directory,'training-freeze.json')));
 assert.equal(freeze.sha256,sha(fitText));
 for(let b=6;b<12;b++)for(let ordinal=0;ordinal<3;ordinal++) {
  assert.equal(await fs.readFile(path.join(f.directory,'sessions','block-'+b,'condition-'+ordinal,'prediction.json'),'utf8'),scoreText);
 }
});
