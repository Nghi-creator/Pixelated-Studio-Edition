import test from 'node:test';
import assert from 'node:assert/strict';
import {collectChallengePhase,inspectChallengePhaseCustody} from './challengePhaseCustody.mjs';
import {pairedPhaseFixture,pairedPlan} from '../receipts/pairedPhaseFixture.mjs';
const start={kind:'n11_pair_phase_started',phase:'degraded',at_ns:1e9};
test('actual collector records native-start, collection and marker causality without clock subtraction',async()=>{
  const raw=pairedPhaseFixture('degraded').raw_observation,prefix={phases:[raw]},order=[],records=[];
  const times=[100n,200n];let calls=0;
  const page={evaluate:async()=>{order.push(++calls===1?'collect':'prefix');return calls===1?raw:prefix;}};
  const result=await collectChallengePhase(page,start,{acquisitionId:pairedPlan.acquisition_id,
    publish:async marker=>order.push(marker),record:r=>{order.push('receipt');records.push(r);},clock:()=>times.shift()});
  assert.equal(result,prefix);
  assert.deepEqual(order,['collect','prefix','n11-phase-degraded.json','receipt']);
  const r=inspectChallengePhaseCustody(records,start,raw,pairedPlan.acquisition_id);
  assert.equal(r.host_start_ns,'100');assert.equal(r.host_end_ns,'200');
  for(const mutate of [v=>v.capture_sha256='sha256:'+'0'.repeat(64),v=>v.marker_published=false,v=>v.host_end_ns='0',v=>v.native_phase_start_sha256='sha256:'+'0'.repeat(64)]){
    const bad=structuredClone(r);mutate(bad);assert.throws(()=>inspectChallengePhaseCustody([bad],start,raw,pairedPlan.acquisition_id));
  }
});
test('failed capture, prefix mismatch and failed marker cannot produce a success receipt',async()=>{
  for(const fail of ['raw','prefix','marker']){
    const raw=pairedPhaseFixture('degraded').raw_observation,records=[];let calls=0,markers=0;
    if(fail==='raw')raw.failure='lost';
    const page={evaluate:async()=>++calls===1?raw:{phases:fail==='prefix'?[]:[raw]}};
    await assert.rejects(collectChallengePhase(page,start,{acquisitionId:pairedPlan.acquisition_id,
      publish:async()=>{markers++;if(fail==='marker')throw Error('marker write failed');},record:r=>records.push(r),clock:()=>1n}));
    assert.equal(records.length,0);assert.equal(markers,fail==='marker'?1:0);
  }
});
