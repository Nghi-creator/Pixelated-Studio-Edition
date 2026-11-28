import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {PHYSICAL_RECIPES,physicalChallengeMode} from '../../n11/protocols/physicalChallengeProtocol.mjs';
const {supportsRawObservation}=createRequire(import.meta.url)('./rawObservationModes.cjs');
test('raw route grammar keeps the existing modes and all six exact challenge variants',()=>{
  for(const r of PHYSICAL_RECIPES)assert.equal(supportsRawObservation(physicalChallengeMode(r)),true);
  for(const prefix of ['engineering-n11-condition-','engineering-n11-resource-condition-'])
    for(const r of ['no_injected_fault','owned_identity_delay','owned_cpu_pressure'])assert.equal(supportsRawObservation(prefix+r),true);
  for(const mode of [null,true,0,'','production-admission','engineering-n11-physical-challenge-mixed_delay_pressure-extra','engineering-n11-capacity-calibration-8'])assert.equal(supportsRawObservation(mode),false);
});
