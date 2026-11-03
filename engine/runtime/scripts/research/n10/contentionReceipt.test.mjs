import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectContentionAcquisition} from '../n11/contentionReceipt.mjs';
function fixture(){
 const phases=['degraded','relief','recovery'],starts=[5e9,9e9,15e9],ends=[8e9,12e9,18e9],ids=['a'.repeat(64),'b'.repeat(64)];
 const result={request_id:'request',outcome:'completed',restoration:'verified_by_port',reason:'duration_elapsed',live_authority:false};
 const events=[{kind:'camera_ready',source:'isolated_game'},
  {kind:'control_capture_bound',scope:'owned_x99_game_display',live_authority:false,binding_hash:'c'.repeat(64)},
  {kind:'n11_pair_dispatched',at_ns:8e9,live_authority:false,request:{request_id:'request',target_fps:24,duration_ns:5e9}},
  {kind:'n11_pair_result',at_ns:14e9,result,ledger_state:'clean',actions:1,reserved_ns:7e9},
  {kind:'n11_pair_journal',state:'clean',actions:1,reserved_ns:7e9,operation_done:true,content_hash:'d'.repeat(64),result},
  {kind:'n11_pressure_started',at_ns:4e9,workers:2,allocation_cores:2,maximum_active_ns:20e9,child_failsafe_ns:40e9,identities:ids,intent_sha256:'e'.repeat(64),live_authority:false},
  {kind:'n11_pressure_cleanup',at_ns:19e9,state:'reaped',identities:ids,live_authority:false},
  {kind:'complete',worker_cleanup:true},{kind:'host_shutdown',stage:'scope_closed'}];
 for(let i=0;i<3;i++){
  events.push({kind:'n11_pair_phase_started',phase:phases[i],at_ns:starts[i],action_elapsed_ns:i===1?1e9:null,worker_identities:{first:'owned'}});
  for(let j=0;j<3;j++)events.push({kind:'n11_pair_native',phase:phases[i],at_ns:starts[i]+j*1e9,sequence:i*10+j+1,
    configured_fps:i===1?24:30,negotiated_fps:i===1?24:30,capture_buffers:100+i*100+j*(i===0?27:24),encoded_buffers:100+i*100+j*(i===0?27:24)});
  events.push({kind:'n11_pair_phase_completed',phase:phases[i],at_ns:ends[i],action_elapsed_ns:i===1?4e9:null});
  for(const [boundary,time] of [['before_start',starts[i]-1e6],['after_end',ends[i]+1e6]])events.push({
    kind:'n11_pressure_sample',phase:phases[i],boundary,at_ns:time,read_start_ns:time,read_end_ns:time,
    active_workers:2,identities:ids,cpu_ns:[time/4,time/4],cgroup:{nr_periods:Math.floor(time/1e8),nr_throttled:Math.floor(time/1e8),throttled_usec:time/1000}});
 }
 for(const [phase,start,frames] of [['healthy',1e9,30],['post',20e9,600]])events.push({kind:'n11_pressure_reference',phase,worker_identities:{first:'owned'},
   samples:Array.from({length:5},(_,i)=>({at_ns:start+i*0.5e9,sequence:i+1,configured_fps:30,negotiated_fps:30,capture_buffers:frames+i*15,encoded_buffers:frames+i*15}))});
 return {status:'passed',method:'n11-contained-contention-paired-v1',role:'engineering_contention_label_unavailable',live_authority:false,events,
   paired_observation:{failure:null,phases:phases.map(phase=>({phase})),priming:phases.map(phase=>({phase,failure:null}))}};
}
test('independent pressure CPU/native vectors give engineering indicators without a label',()=>{
 const r=inspectContentionAcquisition(fixture());assert.equal(r.engineering_screen,'met');
 assert.equal(r.native_references.healthy.fps,30);assert.equal(r.initial_fps,27);assert.equal(r.native_references.post.fps,30);
 assert.equal(r.pressure[0].cpu_percent_one_core,50);assert.equal(r.diagnostic_label,null);assert.equal(r.accepted_diagnostic_groups,0);
});
test('missing throttling, low pressure CPU and absent initial degradation remain unmet findings',()=>{
 for(const mutation of [
  r=>{for(const e of r.events.filter(e=>e.kind==='n11_pressure_sample'))e.cgroup.nr_throttled=0;},
  r=>{for(const e of r.events.filter(e=>e.kind==='n11_pressure_sample'))e.cpu_ns=e.cpu_ns.map(v=>v*0.98);},
  r=>{for(const [i,e] of r.events.filter(e=>e.kind==='n11_pair_native'&&e.phase==='degraded').entries())e.encoded_buffers=100+i*30;}
 ]){const run=fixture();mutation(run);assert.equal(inspectContentionAcquisition(run).engineering_screen,'unmet');}
});
test('incomplete/reset/foreign evidence or unknown cleanup cannot qualify pressure',()=>{
 const mutations=[
  r=>delete r.events.find(e=>e.kind==='n11_pressure_started').intent_sha256,
  r=>r.events.find(e=>e.kind==='n11_pressure_sample').identities=['foreign'],
  r=>r.events.find(e=>e.kind==='n11_pressure_cleanup').state='unknown',
  r=>r.events.find(e=>e.kind==='n11_pressure_sample').read_end_ns=10e9,
  r=>r.events.find(e=>e.kind==='n11_pressure_sample'&&e.boundary==='after_end').cpu_ns=[0,0],
  r=>r.events.find(e=>e.kind==='n11_pressure_reference').samples.pop(),
  r=>r.events=r.events.filter(e=>!(e.kind==='n11_pressure_sample'&&e.phase==='relief'&&e.boundary==='after_end')),
 ];
 // Four reference rows spanning only 1.5 s are insufficient even if their rate is 30.
 for(const change of mutations){const run=fixture();change(run);assert.throws(()=>inspectContentionAcquisition(run));}
});

test('contention plan freezes two workers and refuses scope changes before native output',async()=>{
 const {preparePairedPlan,acquirePairedPlan}=await import('../n11/pairedObservation.mjs');
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'n11-contention-plan-'));
 try{
  const output=path.join(directory,'plan.json');
  const plan=await preparePairedPlan(['--image','sha256:'+'a'.repeat(64),'--acquisition-id','n11-raw-pressure-unit',
    '--core-revision','b'.repeat(40),'--output',output],{contention:true});
  assert.equal(plan.schema_version,'n11-contained-contention-plan-v1');assert.equal(plan.fault.workers,2);
  assert.equal(plan.fault.maximum_active_ms,20000);assert.equal(plan.labels,'unavailable');assert.equal(plan.retry_allowed,false);
  plan.fault.workers=8;await fs.writeFile(output,JSON.stringify(plan,null,2)+'\n');
  const destination=path.join(directory,'must-not-exist');
  await assert.rejects(acquirePairedPlan(['--plan',output,'--output-directory',destination]),/source\/plan mismatch/);
  await assert.rejects(fs.stat(destination),{code:'ENOENT'});
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
