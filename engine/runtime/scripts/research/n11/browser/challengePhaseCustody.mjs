/** Causal collection ordering only; host/browser/container clocks stay separate. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
export const phaseBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export const phaseHash=value=>'sha256:'+createHash('sha256').update(phaseBytes(value)).digest('hex');
const phases=['degraded','relief','recovery'];
export async function collectChallengePhase(page,start,{acquisitionId,publish,record,clock=process.hrtime.bigint}){
  const original=structuredClone(start);
  if(start?.kind!=='n11_pair_phase_started'||!phases.includes(start.phase)||!Number.isSafeInteger(start.at_ns)||start.at_ns<0)
    throw Error('explicit native phase start required');
  const begin=clock();
  if(typeof begin!=='bigint'||begin<0n)throw Error('invalid host collection clock');
  const raw=await page.evaluate(phase=>globalThis.collectPairedPhase(phase),start.phase);
  const prefix=await page.evaluate(()=>globalThis.pairedObservationPrefix);
  if(raw?.failure!==null||raw.phase!==start.phase||raw.comparison_case_id!==acquisitionId||
     !same(prefix?.phases?.[phases.indexOf(start.phase)],raw))throw Error('whole challenge browser capture required');
  const marker='n11-phase-'+start.phase+'.json';
  await publish(marker);
  const end=clock();
  if(typeof begin!=='bigint'||typeof end!=='bigint'||begin<0n||end<begin)throw Error('invalid host collection clock');
  record({kind:'n11_challenge_browser_phase_custody',method:'n11-challenge-browser-phase-custody-v1',
    phase:start.phase,acquisition_id:acquisitionId,native_phase_start_sha256:phaseHash(original),
    capture_sha256:phaseHash(raw),completion_marker:marker,
    ordering:'native_start_observed_then_collection_then_owned_completion_marker',
    host_start_ns:begin.toString(),host_end_ns:end.toString(),host_clock:'host_hrtime_ns_not_aligned_to_container',
    marker_published:true,live_authority:false});
  return prefix;
}

export function inspectChallengePhaseCustody(events,start,raw,acquisitionId){
  const found=events.filter(e=>e.kind==='n11_challenge_browser_phase_custody'&&e.phase===start.phase);
  if(found.length!==1)throw Error('unique challenge browser phase custody required');
  const r=found[0];
  if(r.method!=='n11-challenge-browser-phase-custody-v1'||r.acquisition_id!==acquisitionId||
     r.native_phase_start_sha256!==phaseHash(start)||r.capture_sha256!==phaseHash(raw)||
     r.completion_marker!=='n11-phase-'+start.phase+'.json'||r.marker_published!==true||r.live_authority!==false||
     r.ordering!=='native_start_observed_then_collection_then_owned_completion_marker'||r.host_clock!=='host_hrtime_ns_not_aligned_to_container'||
     ![r.host_start_ns,r.host_end_ns].every(v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v))||BigInt(r.host_end_ns)<BigInt(r.host_start_ns))
    throw Error('challenge browser phase custody mismatch');
  return structuredClone(r);
}
