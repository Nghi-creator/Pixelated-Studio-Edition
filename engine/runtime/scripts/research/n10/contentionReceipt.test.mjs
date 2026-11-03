import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectContentionAcquisition} from '../n11/contentionReceipt.mjs';
import {fixture} from './contentionReceiptFixture.mjs';
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
