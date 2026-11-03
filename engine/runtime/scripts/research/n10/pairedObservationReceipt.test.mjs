import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspectPairedAcquisition} from '../n11/pairedObservationReceipt.mjs';
import {preparePairedPlan,acquirePairedPlan} from '../n11/pairedObservation.mjs';
function example(){
 const phases=['degraded','relief','recovery'],starts=[1e9,5e9,11e9],ends=[4e9,8e9,14e9],dispatch=4e9;
 const events=[{kind:'camera_ready',source:'isolated_game'},
  {kind:'control_capture_bound',scope:'owned_x99_game_display',live_authority:false,binding_hash:'a'.repeat(64)}];
 for(let i=0;i<3;i++){
  events.push({kind:'n11_pair_phase_started',phase:phases[i],at_ns:starts[i],action_elapsed_ns:i===1?starts[i]-dispatch:null,worker_identities:{first:'owned'}});
  for(let j=0;j<3;j++)events.push({kind:'n11_pair_native',phase:phases[i],at_ns:starts[i]+j*1e9,sequence:i*10+j+1,configured_fps:i===1?24:30,negotiated_fps:i===1?24:30,capture_buffers:i*100+j*24,encoded_buffers:i*100+j*24});
  events.push({kind:'n11_pair_phase_completed',phase:phases[i],at_ns:ends[i],action_elapsed_ns:i===1?ends[i]-dispatch:null});
 }
 events.push({kind:'n11_pair_dispatched',at_ns:dispatch,live_authority:false,request:{request_id:'n11-paired-request',target_fps:24,duration_ns:5e9}},
  {kind:'n11_pair_result',at_ns:10e9,result:{request_id:'n11-paired-request',outcome:'completed',restoration:'verified_by_port',reason:'duration_elapsed',live_authority:false},ledger_state:'clean',actions:1,reserved_ns:7e9},
  {kind:'complete',worker_cleanup:true},{kind:'host_shutdown',stage:'scope_closed'});
 events.push({kind:'n11_pair_journal',state:'clean',actions:1,reserved_ns:7e9,content_hash:'b'.repeat(64),operation_done:true,result:events.find(e=>e.kind==='n11_pair_result').result});
 return {status:'passed',method:'n11-contained-paired-observation-v1',role:'engineering_no_fault_no_label',live_authority:false,events,
  paired_observation:{failure:null,phases:phases.map(phase=>({phase})),priming:phases.map(phase=>({phase,failure:null}))}};
}
test('native paired receipt requires bounded whole phases, one result and actual cleanup',()=>{
 const report=inspectPairedAcquisition(example());assert.equal(report.restoration,'verified_by_port');
 assert.deepEqual(report.relief_action_bounds_ns,[1e9,4e9]);assert.equal(report.accepted_diagnostic_groups,0);
 const mutations=[r=>r.status='failed',r=>r.events.push(r.events.find(e=>e.kind==='n11_pair_result')),
  r=>r.events.find(e=>e.kind==='n11_pair_result').ledger_state='dirty',
  r=>r.events.find(e=>e.kind==='n11_pair_result').reserved_ns=5e9,
  r=>r.events.find(e=>e.kind==='camera_ready').source='production',
  r=>r.events.find(e=>e.kind==='n11_pair_native').negotiated_fps=24,
  r=>r.events.find(e=>e.kind==='n11_pair_native').capture_buffers=null,
  r=>r.events.find(e=>e.kind==='n11_pair_phase_started'&&e.phase==='relief').worker_identities.first='replacement',
  r=>r.events.find(e=>e.kind==='n11_pair_phase_completed'&&e.phase==='relief').action_elapsed_ns=5e9,
  r=>r.events=r.events.filter(e=>e.kind!=='host_shutdown'),r=>r.paired_observation.priming[1].failure='lost'];
 for(const mutate of mutations){const r=example();mutate(r);assert.throws(()=>inspectPairedAcquisition(r));}
});
test('paired plans freeze one no-fault action and reject changed scope before output/native launch',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'n11-paired-plan-'));
 try{
  const output=path.join(directory,'plan.json');const args=['--image','sha256:'+'a'.repeat(64),'--acquisition-id','n11-raw-paired-unit','--core-revision','b'.repeat(40),'--output',output];
  const plan=await preparePairedPlan(args);assert.equal(plan.fault,'none');assert.equal(plan.action_duration_ms,5000);
  assert.equal(plan.browser_samples_per_phase,4);assert.equal(plan.retry_allowed,false);
  await assert.rejects(preparePairedPlan(args),{code:'EEXIST'});
  plan.fault='host_contention';await fs.writeFile(output,JSON.stringify(plan,null,2)+'\n');
  const destination=path.join(directory,'must-not-exist');
  await assert.rejects(acquirePairedPlan(['--plan',output,'--output-directory',destination]),/source\/plan mismatch/);
  await assert.rejects(fs.stat(destination),{code:'ENOENT'});
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
