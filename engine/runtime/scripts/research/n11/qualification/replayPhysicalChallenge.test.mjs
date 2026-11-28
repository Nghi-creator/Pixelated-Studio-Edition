import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../receipts/physicalChallengeMediaFixture.mjs';
import {replayPhysicalChallenge} from './replayPhysicalChallenge.mjs';
const bytes=v=>Buffer.from(JSON.stringify(v));
test('producer replay checks current source twice and ignores saved inspection claims',async()=>{
  const acquisition=fixture(),sources={'research/unit.py':'a'.repeat(64)};
  const plan={acquisition_id:'n11-raw-paired-fixture',source_sha256:sources,native_software_hash:'b'.repeat(64)};
  let checks=0;
  const report=await replayPhysicalChallenge(bytes(acquisition),bytes(plan),{sources:async()=>{checks++;return sources;},software:async()=>'b'.repeat(64)});
  assert.equal(checks,2);assert.equal(report.media.method,'n11-physical-challenge-media-inspection-v2');
  assert.equal(report.media.phase_causal_containment_verified,true);assert.equal(report.empirical_acceptance,false);
  await assert.rejects(replayPhysicalChallenge(bytes(acquisition),bytes(plan),{sources:async()=>({}),software:async()=>'b'.repeat(64)}),/differs/);
  checks=0;
  await assert.rejects(replayPhysicalChallenge(bytes(acquisition),bytes(plan),{sources:async()=>++checks===1?sources:{},software:async()=>'b'.repeat(64)}),/differs/);
});
