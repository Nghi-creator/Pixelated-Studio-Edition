import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fixture as defaultFixture} from './pacingReceiptFixture.mjs';
import {inspectPacingAcquisition} from '../n11/pacingReceipt.mjs';
import {preparePairedPlan} from '../n11/pairedObservation.mjs';
function fixture(){
 const run=defaultFixture();run.method='n11-contained-pacing-contrast-v1';run.role='engineering_pacing_contrast_label_unavailable';
 for(const e of run.events){
  if(e.observation){e.observation.method='n11-owned-pacing-contrast-v1';if(e.observation.sleep_time_us===50000)e.observation.sleep_time_us=37500;}
 }
 for(const [i,e] of run.events.filter(e=>e.kind==='n11_pair_native'&&e.phase==='degraded').entries())e.encoded_buffers=100+i*26;
 return run;
}
test('contrast variant holds its own property with measured native crossing and no label',()=>{
 const r=inspectPacingAcquisition(fixture(),{contrast:true});
 assert.equal(r.engineering_screen,'met');assert.equal(r.initial_fps,26);assert.equal(r.contrast.relief_fps,24);
 assert.equal(r.indicators.initial_native_above_target,true);assert.equal(r.indicators.relief_native_below_initial,true);
 assert.equal(r.accepted_diagnostic_groups,0);assert.equal(r.diagnostic_label,null);
});
test('foreign protocol/property fails; modeled crossing cannot substitute actual effect',()=>{
 assert.throws(()=>inspectPacingAcquisition(fixture()));
 const wrong=fixture();wrong.events.find(e=>e.kind==='n11_pacing_sample').observation.sleep_time_us=50000;
 assert.throws(()=>inspectPacingAcquisition(wrong,{contrast:true}));
 const absent=fixture();for(const [i,e] of absent.events.filter(e=>e.kind==='n11_pair_native'&&e.phase==='degraded').entries())e.encoded_buffers=100+i*24;
 const result=inspectPacingAcquisition(absent,{contrast:true});assert.equal(result.engineering_screen,'unmet');
 assert.equal(result.indicators.initial_native_above_target,false);assert.equal(result.indicators.relief_native_below_initial,false);
 assert.throws(()=>inspectPacingAcquisition(fixture(),{contrast:1}));
});
test('preparation freezes separate protocol and source; mixed variants and overwrite fail',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pacing-contrast-plan-'));
 const args=['--image','sha256:'+'a'.repeat(64),'--acquisition-id','n11-raw-contrast-unit','--core-revision','b'.repeat(40),'--output',path.join(dir,'plan.json')];
 try{
  const plan=await preparePairedPlan(args,{contrast:true});
  assert.equal(plan.schema_version,'n11-contained-pacing-contrast-plan-v1');assert.equal(plan.fault.delay_us,37500);
  assert.deepEqual(plan.target_fps,[30,24,30]);assert.equal(plan.action_duration_ms,5000);assert.equal(plan.retry_allowed,false);
  assert.deepEqual(plan.contrast.ceiling,{numerator:80,denominator:3});
  await assert.rejects(()=>preparePairedPlan(args,{contrast:true}));
  await assert.rejects(()=>preparePairedPlan(args,{contrast:true,pacing:true}));
  await assert.rejects(()=>preparePairedPlan(args,{contrast:'true'}));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('native read brackets bind to generation and cannot be replaced with parent event time',async()=>{
 const {createHash}=await import('node:crypto');
 const run=fixture(),gen=run.events.find(e=>e.kind==='n11_pair_dispatched').request.generation;
 const clock='worker-monotonic-'+createHash('sha256').update(JSON.stringify({owner:gen.owner,peer:gen.peer,pipeline:gen.pipeline})).digest('hex');
 for(const row of run.events.filter(e=>e.kind==='n11_pair_native')){
  row.native_read={method:'native-counter-read-brackets-v1',clock_id:clock,basis:'worker_elapsed_monotonic_ns',read_start_ns:row.at_ns-1e9,read_end_ns:row.at_ns-1e9+1e6};
 }
 const r=inspectPacingAcquisition(run,{contrast:true,requireNativeReads:true});
 assert.equal(r.native_counter_reads.state,'complete');assert.equal(r.native_counter_reads.clock_id,clock);
 assert.equal(r.native_counter_reads.read_count,9);
 assert.throws(()=>inspectPacingAcquisition(fixture(),{contrast:true,requireNativeReads:true}));
 assert.equal(inspectPacingAcquisition(fixture(),{contrast:true}).native_counter_reads.state,'unavailable_legacy');
 const changed=structuredClone(run);changed.events.find(e=>e.kind==='n11_pair_native').native_read.clock_id='worker-monotonic-'+'f'.repeat(64);
 assert.throws(()=>inspectPacingAcquisition(changed,{contrast:true}));
 const partial=structuredClone(run);delete partial.events.find(e=>e.kind==='n11_pair_native').native_read;
 assert.throws(()=>inspectPacingAcquisition(partial,{contrast:true}));
 assert.throws(()=>inspectPacingAcquisition(run,{requireNativeReads:true}));
});
