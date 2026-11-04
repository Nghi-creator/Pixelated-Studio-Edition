import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './pacingReceiptFixture.mjs';
import {inspectPacingAcquisition} from '../n11/pacingReceipt.mjs';

test('separate pacing effect keeps labels unavailable and recovery attribution explicit',()=>{
 const r=inspectPacingAcquisition(fixture());assert.equal(r.engineering_screen,'met');assert.equal(r.initial_fps,20);
 assert.equal(r.native_references.healthy.fps,30);assert.equal(r.diagnostic_label,null);
 assert.match(r.recovery_attribution,/independent_fault_removal/);
});
test('changed property, stale sequence and unknown cleanup fail; absent effect remains unmet',()=>{
 for(const change of [r=>r.events.find(e=>e.kind==='n11_pacing_sample').observation.sleep_time_us=25000,
  r=>r.events.find(e=>e.kind==='n11_pacing_sample').observation.sequence=1,
  r=>r.events.find(e=>e.kind==='n11_pacing_cleanup').state='unknown']){
  const r=fixture();change(r);assert.throws(()=>inspectPacingAcquisition(r));
 }
 const r=fixture();for(const [i,e] of r.events.filter(e=>e.kind==='n11_pair_native'&&e.phase==='degraded').entries())e.encoded_buffers=100+i*30;
 assert.equal(inspectPacingAcquisition(r).engineering_screen,'unmet');
});

test('generation equality is independent of JSON key order',()=>{
 const r=fixture();
 for(const e of r.events){if(e.observation){const g=e.observation.generation;e.observation.generation={peer:g.peer,pipeline:g.pipeline,owner:g.owner};}}
 assert.equal(inspectPacingAcquisition(r).engineering_screen,'met');
});
