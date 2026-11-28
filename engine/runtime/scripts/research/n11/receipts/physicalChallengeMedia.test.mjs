import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './physicalChallengeMediaFixture.mjs';
import {pairedPlan} from './pairedPhaseFixture.mjs';
import {inspectPhysicalChallengeMedia} from './physicalChallengeMedia.mjs';
import {PHYSICAL_RECIPES} from '../protocols/physicalChallengeProtocol.mjs';
const inspect=run=>inspectPhysicalChallengeMedia(Buffer.from(JSON.stringify(run)),pairedPlan.acquisition_id);
test('all six raw modes verify media without stable-pair or diagnostic admission',()=>{
  for(const recipe of PHYSICAL_RECIPES){
    const run=fixture(recipe),before=JSON.stringify(run),report=inspect(run);
    assert.equal(report.phase_media_consistent,true);
    assert.equal(report.phases.length,3);
    for(const k of ['source_media_verified','resource_dose_verified','n2_pair_admitted','empirical_acceptance','receiver_delivery_verified','phase_clock_alignment_verified'])assert.equal(report[k],false);
    assert.equal(JSON.stringify(run),before);
  }
});
test('retained browser/native prefixes, settings, progression and restoration are mandatory',()=>{
  const mutations=[
    r=>r.status='failed',r=>r.mode='engineering-n11-resource-condition-owned_cpu_pressure',
    r=>r.paired_observation.phases[0].comparison_case_id='n11-raw-foreign',
    r=>r.paired_observation.phases[1].browser_samples[0].connectionState='disconnected',
    r=>r.paired_observation.phases[1].browser_samples[0].iceConnectionState='failed',
    r=>r.paired_observation.phases[1].browser_samples[3].framesDecoded=0,
    r=>r.paired_observation.phases[1].browser_samples[1].packetsLostTotal=null,
    r=>r.paired_observation.phases[1].engine_snapshots[0].encoder.targetFps=30,
    r=>r.paired_observation.phases[1].engine_snapshots[0].engine.cpuCapacityCores=4,
    r=>r.paired_observation.phases[1].engine_snapshots[1].engine.cameraRunning=false,
    r=>r.paired_observation.phases[1].engine_snapshots[2].encoder.framesOutTotal=0,
    r=>r.paired_observation.phases[1].engine_snapshots=[],
    r=>r.events.find(e=>e.kind==='n11_pair_result').result.restoration='unconfirmed',
    r=>r.events.find(e=>e.kind==='n11_pair_phase_completed').at_ns-=1e9,
  ];
  for(const mutate of mutations){const r=fixture();mutate(r);assert.throws(()=>inspect(r));}
  assert.throws(()=>inspectPhysicalChallengeMedia(Buffer.alloc(0),pairedPlan.acquisition_id));
});
