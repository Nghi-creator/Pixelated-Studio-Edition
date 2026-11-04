import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {CONDITIONS,conditionVariant} from '../n11/conditionProtocol.mjs';
import {pacingVariant} from '../n11/pacingVariants.mjs';
import {inspectConditionAcquisition} from '../n11/conditionReceipt.mjs';
import {prepareConditionPlan,acquireConditionPlan} from '../n11/conditionObservation.mjs';
import {fixture} from './conditionReceiptFixture.mjs';
for(const condition of CONDITIONS)test('common condition evidence '+condition,()=>{
 const r=inspectConditionAcquisition(fixture(condition),{condition});
 assert.equal(r.condition_integrity,'verified_declared_internal_evidence');assert.equal(r.diagnostic_label,null);assert.equal(r.accepted_diagnostic_groups,0);
 assert.equal(r.native_counter_reads.reference_reads,true);assert.equal(r.phase_resources.length,condition==='owned_cpu_pressure'?3:0);
 if(condition==='owned_cpu_pressure')assert.ok(r.phase_resources.every(p=>p.resource_indicator));
 if(condition!=='owned_identity_delay')assert.equal(r.engineering_screen,'unmet');
});
test('conditions are closed, cannot mix variants or declare a diagnostic label',()=>{
 for(const condition of [true,0,'healthy','host_contention','render_capture_slowdown','owned_identity_delay;anything'])assert.throws(()=>conditionVariant(condition));
 for(const options of [{contrast:true},{calibrationIndex:3},{confirmation:true}])assert.throws(()=>pacingVariant({condition:'no_injected_fault',...options}));
 assert.equal(pacingVariant({condition:'owned_identity_delay'}).delay,34000);
});
const mutations=[
 r=>r.events.find(e=>e.kind==='n11_condition_started').at_ns=4.2e9,
 r=>delete r.events.find(e=>e.kind==='n11_pacing_reference').samples[0].condition_witness,
 r=>r.events.find(e=>e.kind==='n11_condition_sample').witness.property.sleep_time_us=1,
 r=>r.events.find(e=>e.kind==='n11_condition_sample').witness.pressure.active_workers=0,
 r=>r.events.find(e=>e.kind==='n11_condition_sample').witness.pressure.cpu_ns=[-1,0],
 r=>r.events.find(e=>e.kind==='n11_condition_sample').witness.pressure_read_end_ns=6e9,
 r=>r.events.find(e=>e.kind==='n11_condition_sample').witness.generation={owner:'foreign',pipeline:'pipeline',peer:'first'},
 r=>r.events.find(e=>e.kind==='n11_condition_cleanup').state='unknown',
 r=>r.events.find(e=>e.kind==='n11_condition_started').pressure.workers=1,
 r=>r.events.find(e=>e.kind==='n11_condition_started').pressure.intent_sha256=null,
 r=>r.events.find(e=>e.kind==='n11_pacing_reference'&&e.phase==='post').samples[0].condition_witness.pressure.cpu_ns=[],
 r=>r.events.push({kind:'n11_pressure_started'}),
 r=>r.mode='engineering-n11-condition-no_injected_fault',
 r=>r.events.filter(e=>e.kind==='n11_condition_sample')[1].witness.pressure.cpu_ns=[0,0],
 r=>r.events.filter(e=>e.kind==='n11_condition_sample')[1].witness.pressure.cgroup.nr_periods=0,
 r=>r.events.filter(e=>e.kind==='n11_condition_sample')[1].witness.property.sequence=1,
 r=>r.events.find(e=>e.kind==='n11_condition_sample').witness.property_read_end_ns=0,
 r=>r.events.push(structuredClone(r.events.find(e=>e.kind==='n11_condition_sample'))),
];
for(const [i,mutate] of mutations.entries())test('condition rejects partial/foreign/reset evidence '+i,()=>{
 const run=fixture('owned_cpu_pressure');mutate(run);assert.throws(()=>inspectConditionAcquisition(run,{condition:'owned_cpu_pressure'}));
});
test('unused registry cannot hide owned workers or missing zero-delay acknowledgement',()=>{
 for(const change of [w=>w.pressure.identities=['a'.repeat(64)],w=>w.pressure.used=true,w=>delete w.property.started]){
  const run=fixture('no_injected_fault');change(run.events.find(e=>e.kind==='n11_condition_sample').witness);
  assert.throws(()=>inspectConditionAcquisition(run,{condition:'no_injected_fault'}));
 }
});
test('condition plan is source-bound, exclusive and changed plans fail before acquisition',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'condition-plan-'));
 const base=['--image','sha256:'+'a'.repeat(64),'--acquisition-id','n11-raw-condition-unit','--core-revision','b'.repeat(40)];
 try{
  for(const condition of CONDITIONS){
   const file=path.join(dir,condition+'.json'),args=[...base,'--condition',condition,'--output',file];
   const p=await prepareConditionPlan(args);assert.equal(p.fault.delay_us,conditionVariant(condition).delay);
   assert.equal(p.labels,'unavailable');assert.equal(p.retry_allowed,false);assert.equal(p.action_duration_ms,5000);
   await assert.rejects(()=>prepareConditionPlan(args));
   p.fault.delay_us=1;await fs.writeFile(file,JSON.stringify(p,null,2)+'\n');
   await assert.rejects(()=>acquireConditionPlan(['--plan',file,'--output-directory',path.join(dir,'output')]));
   await assert.rejects(()=>fs.stat(path.join(dir,'output')));
   const link=path.join(dir,condition+'.link');await fs.symlink(file,link);
   await assert.rejects(()=>acquireConditionPlan(['--plan',link,'--output-directory',path.join(dir,'output')]));
  }
  await assert.rejects(()=>prepareConditionPlan([...base,'--condition','healthy','--output',path.join(dir,'bad.json')]));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
