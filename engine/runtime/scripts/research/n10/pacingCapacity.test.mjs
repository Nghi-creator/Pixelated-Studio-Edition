/** Synthetic capacity vectors, never acquired data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fixture as defaultFixture} from './pacingReceiptFixture.mjs';
import {CAPACITY_GRID,pacingVariant} from '../n11/pacingVariants.mjs';
import {inspectPacingAcquisition} from '../n11/pacingReceipt.mjs';
import {prepareCapacityPlan} from '../n11/pairedObservation.mjs';
function fixture(index,confirmation=false){
 const run=defaultFixture(),variant=pacingVariant({calibrationIndex:index,confirmation});
 Object.assign(run,{method:variant.method,role:variant.role});
 for(const e of run.events)if(e.observation){
  e.observation.method=variant.ownedMethod;e.observation.started=true;
  if(!e.observation.stopped)e.observation.sleep_time_us=variant.delay;
 }
 const gen=run.events.find(e=>e.kind==='n11_pair_dispatched').request.generation;
 const clock='worker-monotonic-'+createHash('sha256').update(JSON.stringify({owner:gen.owner,peer:gen.peer,pipeline:gen.pipeline})).digest('hex');
 const references=phase=>run.events.find(e=>e.kind==='n11_pacing_reference'&&e.phase===phase).samples;
 const rows=[...references('healthy'),...run.events.filter(e=>e.kind==='n11_pair_native'),...references('post')];
 for(const [i,row] of rows.entries()){
  row.sequence=i+1;row.native_read={method:'native-counter-read-brackets-v1',clock_id:clock,basis:'worker_elapsed_monotonic_ns',read_start_ns:row.at_ns-1e8,read_end_ns:row.at_ns-1e8+1e6};
 }
 return run;
}
test('capacity has only eight fixed indices, separate identities and no arbitrary delay',()=>{
 assert.deepEqual(CAPACITY_GRID,[0,30000,32000,34000,36000,37500,40000,50000]);
 for(const [i,delay] of CAPACITY_GRID.entries()){
  assert.equal(pacingVariant({calibrationIndex:i}).delay,delay);
  const receipt=inspectPacingAcquisition(fixture(i),{calibrationIndex:i});
  assert.equal(receipt.native_counter_reads.reference_reads,true);
  assert.equal(receipt.native_counter_reads.read_count,19);
  assert.equal(receipt.accepted_diagnostic_groups,0);assert.equal(receipt.diagnostic_label,null);
  assert.equal(receipt.contrast,undefined);
 }
 for(const calibrationIndex of [-1,8,true,1.5,'1',NaN])assert.throws(()=>pacingVariant({calibrationIndex}));
 assert.throws(()=>pacingVariant({calibrationIndex:1,contrast:true}));
 assert.throws(()=>pacingVariant({confirmation:true}));
 assert.throws(()=>inspectPacingAcquisition(fixture(1)));
});
test('capacity requires healthy/post worker brackets and zero-delay start acknowledgement',()=>{
 for(const phase of ['healthy','post']){
  const run=fixture(0);delete run.events.find(e=>e.kind==='n11_pacing_reference'&&e.phase===phase).samples[0].native_read;
  assert.throws(()=>inspectPacingAcquisition(run,{calibrationIndex:0}));
 }
 for(const change of [r=>delete r.started,r=>r.started=false,r=>r.sleep_time_us=30000]){
  const run=fixture(0);change(run.events.find(e=>e.kind==='n11_pacing_started').observation);
  assert.throws(()=>inspectPacingAcquisition(run,{calibrationIndex:0}));
 }
 const run=fixture(1);run.events.find(e=>e.kind==='n11_pacing_reference'&&e.phase==='post').samples[0].native_read.clock_id='worker-monotonic-'+'f'.repeat(64);
 assert.throws(()=>inspectPacingAcquisition(run,{calibrationIndex:1}));
});
test('confirmation retains separate role and actual-contrast indicators',()=>{
 const run=fixture(3,true);
 const result=inspectPacingAcquisition(run,{calibrationIndex:3,confirmation:true});
 assert.equal(result.capacity.role,'confirmation');assert.equal(result.contrast.delay_us,34000);
 assert.equal(result.indicators.initial_native_above_target,false);
 assert.equal(result.contrast.independent_n3_check,'required_unavailable_in_producer');
 assert.throws(()=>inspectPacingAcquisition(run,{calibrationIndex:3}));
});
test('capacity preparation binds index/source and confirmation selection bytes without overwrite',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'capacity-plan-'));
 const base=['--image','sha256:'+'a'.repeat(64),'--acquisition-id','n11-raw-capacity-unit','--core-revision','b'.repeat(40)];
 const file=path.join(dir,'plan.json');
 try{
  const plan=await prepareCapacityPlan([...base,'--output',file,'--grid-index','0']);
  assert.equal(plan.fault.delay_us,0);assert.equal(plan.capacity.native_reference_reads_required,true);
  assert.deepEqual(plan.capacity.grid_delay_us,CAPACITY_GRID);assert.equal(plan.capacity.selection_sha256,null);
  await assert.rejects(()=>prepareCapacityPlan([...base,'--output',file,'--grid-index','0']));
  for(const index of ['8','-1','01','true','37500'])await assert.rejects(()=>prepareCapacityPlan([...base,'--output',path.join(dir,index+'.json'),'--grid-index',index]));
  const selection={method_release:'n11-capacity-calibration-v1',selection_state:'candidate_for_confirmation',selected_grid_index:3,
   source_manifest_hash:plan.source_manifest_hash,producer_revision:plan.producer_revision,image:plan.image,core_revision:plan.core_revision,
   selected_delay_us:34000,selection_rule:'complete_fixed_grid_capacity_only_lower_median_v1',grid_delay_us:[...CAPACITY_GRID],
   rows:CAPACITY_GRID.map((delay,i)=>({grid_index:i,delay_us:delay,qualifies:true,case_sha256:'sha256:'+String(i).repeat(64),generation_clock_id:'worker-monotonic-'+String(i).repeat(64),acquisition_id:'n11-raw-slot-'+i,
    conditions:{healthy_lower_at_least_27:true,initial_lower_above_24:true,initial_upper_at_most_95pct_healthy_lower:true,post_lower_at_least_95pct_healthy_upper:true}}))};
  const selected=path.join(dir,'selection.json'),confirm=path.join(dir,'confirm.json');
  const bytes=JSON.stringify(selection);await fs.writeFile(selected,bytes);
  const confirmation=await prepareCapacityPlan([...base,'--output',confirm,'--selection',selected],{confirmation:true});
  assert.equal(confirmation.capacity.grid_index,3);assert.equal(confirmation.fault.delay_us,34000);
  assert.equal(confirmation.capacity.selection_sha256,'sha256:'+createHash('sha256').update(bytes).digest('hex'));
  assert.equal(await fs.readFile(path.join(dir,plan.acquisition_id+'.selection.json'),'utf8'),bytes);
  const tampered=structuredClone(selection);tampered.selected_grid_index=4;tampered.selected_delay_us=36000;
  await fs.writeFile(selected,JSON.stringify(tampered));
  await assert.rejects(()=>prepareCapacityPlan([...base,'--output',path.join(dir,'tampered.json'),'--selection',selected],{confirmation:true}));
  await fs.writeFile(selected,bytes);
  const link=path.join(dir,'link');await fs.symlink(selected,link);
  await assert.rejects(()=>prepareCapacityPlan([...base,'--output',confirm,'--selection',link],{confirmation:true}));
  selection.image='sha256:'+'f'.repeat(64);await fs.writeFile(selected,JSON.stringify(selection));
  await assert.rejects(()=>prepareCapacityPlan([...base,'--output',confirm,'--selection',selected],{confirmation:true}));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
