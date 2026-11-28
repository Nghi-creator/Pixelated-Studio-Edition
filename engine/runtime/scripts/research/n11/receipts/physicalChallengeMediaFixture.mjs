/** Invented raw challenge telemetry; never a source qualification receipt. */
import {phaseHash} from '../browser/challengePhaseCustody.mjs';
import {fixture as controlFixture} from './contentionReceiptFixture.mjs';
import {pairedPhaseFixture} from './pairedPhaseFixture.mjs';
import {PHYSICAL_METHOD,PHYSICAL_ROLE,physicalChallengeMode} from '../protocols/physicalChallengeProtocol.mjs';
export function fixture(recipe='mixed_delay_pressure',acquisitionId='n11-raw-paired-fixture'){
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
  for(const raw of run.paired_observation.phases){
    raw.comparison_case_id=acquisitionId;
    const start=run.events.find(e=>e.kind==='n11_pair_phase_started'&&e.phase===raw.phase);
    run.events.push({kind:'n11_challenge_browser_phase_custody',method:'n11-challenge-browser-phase-custody-v1',
      phase:raw.phase,acquisition_id:acquisitionId,native_phase_start_sha256:phaseHash(start),capture_sha256:phaseHash(raw),
      completion_marker:'n11-phase-'+raw.phase+'.json',ordering:'native_start_observed_then_collection_then_owned_completion_marker',
      host_start_ns:'100',host_end_ns:'200',host_clock:'host_hrtime_ns_not_aligned_to_container',marker_published:true,live_authority:false});
  }
  return run;
}
