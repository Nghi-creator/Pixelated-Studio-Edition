import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture as pressureFixture} from './contentionReceiptFixture.mjs';
import {inspectPacingAcquisition} from '../n11/pacingReceipt.mjs';
function fixture(){
 const run=pressureFixture();run.method='n11-contained-pacing-paired-v1';run.role='engineering_pacing_label_unavailable';
 run.events=run.events.filter(e=>!e.kind.startsWith('n11_pressure_'));
 const gen={owner:'owned',pipeline:'pipeline',peer:'first'};
 run.events.find(e=>e.kind==='n11_pair_dispatched').request.generation=gen;
 const state=(sequence,delay=50000)=>({method:'n11-owned-pacing-v1',generation:gen,sequence,worker_elapsed_ns:sequence*100000000,
  sleep_time_us:delay,stopped:delay===0,expired:false,failed:false});
 run.events.push({kind:'n11_pacing_started',at_ns:4e9,maximum_active_ns:20e9,observation:state(1)},
  {kind:'n11_pacing_cleanup',at_ns:19e9,state:'restored',observation:state(8,0)});
 for(const [i,phase] of ['degraded','relief','recovery'].entries()){
  const start=run.events.find(e=>e.kind==='n11_pair_phase_started'&&e.phase===phase).at_ns;
  const end=run.events.find(e=>e.kind==='n11_pair_phase_completed'&&e.phase===phase).at_ns;
  for(const [j,boundary,t] of [[0,'before_start',start-1e6],[1,'after_end',end+1e6]])
   run.events.push({kind:'n11_pacing_sample',phase,boundary,read_start_ns:t,read_end_ns:t,observation:state(i*2+j+2)});
 }
 for(const [phase,t,base] of [['healthy',1e9,30],['post',20e9,600]])run.events.push({kind:'n11_pacing_reference',phase,worker_identities:{first:'owned'},samples:
  Array.from({length:5},(_,i)=>({at_ns:t+i*0.5e9,sequence:i+1,configured_fps:30,negotiated_fps:30,encoded_buffers:base+i*15,capture_buffers:base+i*15}))});
 for(const [i,e] of run.events.filter(e=>e.kind==='n11_pair_native'&&e.phase==='degraded').entries())e.encoded_buffers=100+i*20;
 return run;
}
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
