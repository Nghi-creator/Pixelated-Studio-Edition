/** Invented raw challenge telemetry; never a source qualification receipt. */
import {fixture as controlFixture} from './contentionReceiptFixture.mjs';
import {pairedPhaseFixture} from './pairedPhaseFixture.mjs';
import {PHYSICAL_METHOD,PHYSICAL_ROLE,physicalChallengeMode} from '../protocols/physicalChallengeProtocol.mjs';
export function fixture(recipe='mixed_delay_pressure'){
  const run=controlFixture();
  Object.assign(run,{method:PHYSICAL_METHOD,role:PHYSICAL_ROLE,mode:physicalChallengeMode(recipe),challenge_recipe:recipe});
  run.events=run.events.filter(e=>!e.kind.startsWith('n11_pressure_'));
  for(const row of run.events.filter(e=>e.kind==='n11_pair_phase_completed')){
    row.at_ns+=0.2e9;
    if(row.phase==='relief')row.action_elapsed_ns+=0.2e9;
  }
  run.events.find(e=>e.kind==='n11_pair_dispatched').at_ns=8.3e9;
  for(const e of run.events.filter(e=>['n11_pair_phase_started','n11_pair_phase_completed'].includes(e.kind)&&e.phase==='relief'))e.action_elapsed_ns=e.at_ns-8.3e9;
  run.paired_observation.phases=['degraded','relief','recovery'].map(p=>pairedPhaseFixture(p).raw_observation);
  return run;
}
