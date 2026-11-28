/** Raw phase and cadence consistency, separate from condition/source qualification. */
import {createHash} from 'node:crypto';
import {PHYSICAL_METHOD, PHYSICAL_ROLE, physicalChallengeSelection} from '../protocols/physicalChallengeProtocol.mjs';
import {inspectPairedAcquisition} from './pairedObservationReceipt.mjs';
import {inspectRawPhaseMedia} from './observedPhase.mjs';
const safe=value=>Number.isSafeInteger(value)&&value>=0;
const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');

export function inspectPhysicalChallengeMedia(acquisitionBytes, acquisitionId) {
  if(!Buffer.isBuffer(acquisitionBytes)||!acquisitionBytes.length||acquisitionBytes.length>4*1024*1024)
    throw Error('bounded original challenge acquisition bytes required');
  const run=JSON.parse(acquisitionBytes);
  const recipe=physicalChallengeSelection(run.mode);
  if(!recipe||run.challenge_recipe!==recipe)throw Error('explicit challenge media mode required');
  const control=inspectPairedAcquisition(run,{method:PHYSICAL_METHOD,role:PHYSICAL_ROLE});
  const phases=run.paired_observation.phases.map(raw=>{
    const report=inspectRawPhaseMedia(raw,acquisitionId);
    const bounds=control.phase_native_bounds.find(row=>row.phase===raw.phase);
    if(bounds.end_ns-bounds.start_ns<3.2e9||bounds.end_ns-bounds.start_ns>4.5e9)
      throw Error('challenge whole-phase duration unavailable');
    let previous;
    for(const row of raw.browser_samples){
      if(row.iceConnectionState!=='connected'&&row.iceConnectionState!=='completed')throw Error('browser ICE unavailable');
      if(!['framesDecoded','framesDropped','freezeCount','keyFramesDecoded','packetsLostTotal'].every(k=>safe(row[k]))||!Number.isFinite(row.freezeDurationTotalMs)||row.freezeDurationTotalMs<0||
         previous&&['framesDecoded','framesDropped','freezeCount','freezeDurationTotalMs','keyFramesDecoded','packetsLostTotal'].some(k=>row[k]<previous[k]))
        throw Error('browser media counter reset or missing');
      previous=row;
    }
    if(raw.browser_samples.at(-1).framesDecoded<=raw.browser_samples[0].framesDecoded)
      throw Error('browser media did not advance');
    previous=null;
    for(const row of raw.engine_snapshots){
      const e=row.encoder;
      if(row.engine?.runtimeKind!=='native_linux'||row.engine.cpuCapacityCores!==2||row.engine.peerCount!==1||
         !['nodeRunning','cameraRunning','emulatorRunning'].every(k=>row.engine[k]===true)||
         !['framesInTotal','framesOutTotal','framesDroppedTotal','queueLevelBuffers'].every(k=>safe(e[k]))||
         previous&&['framesInTotal','framesOutTotal','framesDroppedTotal'].some(k=>e[k]<previous[k]))
        throw Error('native phase source or counters unavailable');
      previous=e;
    }
    if(raw.engine_snapshots.at(-1).encoder.framesOutTotal<=raw.engine_snapshots[0].encoder.framesOutTotal)
      throw Error('encoder media did not advance');
    return {...report,controller_bounds:bounds};
  });
  return {method:'n11-physical-challenge-media-inspection-v1',
    acquisition_sha256:sha(acquisitionBytes),recipe,acquisition_id:acquisitionId,
    phase_media_consistent:true,cadence_restoration:control.restoration,phases,
    scope:'declared_raw_media_and_cadence_consistency_requires_separate_source_links',
    phase_clock_alignment_verified:false,receiver_delivery_verified:false,
    source_media_verified:false,resource_dose_verified:false,n2_pair_admitted:false,
    diagnostic_label:null,empirical_acceptance:false,acquisition_authority:false};
}
