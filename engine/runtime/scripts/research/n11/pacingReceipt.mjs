/** Separate pacing evidence and descriptive effect; no scientific label acceptance. */
import {inspectPairedAcquisition} from './pairedObservationReceipt.mjs';
export function inspectPacingAcquisition(run){
 const control=inspectPairedAcquisition(run,{method:'n11-contained-pacing-paired-v1',role:'engineering_pacing_label_unavailable'});
 const events=run.events;
 const one=(kind,phase)=>{const rows=events.filter(e=>e.kind===kind&&(phase===undefined||e.phase===phase));if(rows.length!==1)throw Error('unique pacing evidence required');return rows[0];};
 const start=one('n11_pacing_started'),stop=one('n11_pacing_cleanup');
 const safe=v=>Number.isSafeInteger(v)&&v>=0;
 const generation=start.observation?.generation;
 const sameGeneration=(a,b)=>a&&b&&Object.keys(a).length===3&&Object.keys(b).length===3&&['owner','pipeline','peer'].every(k=>typeof a[k]==='string'&&a[k]===b[k]);
 if(!sameGeneration(generation,control.controller_request.generation))throw Error('pacing generation does not match probe');
 const valid=o=>o?.method==='n11-owned-pacing-v1'&&sameGeneration(o.generation,generation)&&safe(o.sequence)&&safe(o.worker_elapsed_ns)&&o.expired===false&&o.failed===false;
 if(!start.observation?.generation||!safe(start.at_ns)||!safe(stop.at_ns)||start.maximum_active_ns!==20e9||
  stop.at_ns<=start.at_ns||stop.at_ns-start.at_ns>=20e9||!valid(start.observation)||start.observation.sleep_time_us!==50000||
  stop.state!=='restored'||!valid(stop.observation)||stop.observation.sleep_time_us!==0||stop.observation.stopped!==true)throw Error('pacing ownership/cleanup unavailable');
 let last=start.observation.sequence;
 for(const phase of ['degraded','relief','recovery']){
  const a=events.filter(e=>e.kind==='n11_pacing_sample'&&e.phase===phase&&e.boundary==='before_start');
  const b=events.filter(e=>e.kind==='n11_pacing_sample'&&e.phase===phase&&e.boundary==='after_end');
  if(a.length!==1||b.length!==1)throw Error('whole-phase pacing support required');
  const bounds=control.phase_native_bounds.find(v=>v.phase===phase);
  if(a[0].read_end_ns>bounds.start_ns||b[0].read_start_ns<bounds.end_ns||a[0].read_start_ns<start.at_ns||b[0].read_end_ns>stop.at_ns)throw Error('pacing phase support outside bounds');
  for(const row of [a[0],b[0]]){
   if(!safe(row.read_start_ns)||!safe(row.read_end_ns)||row.read_end_ns<row.read_start_ns||!valid(row.observation)||
    row.observation.sleep_time_us!==50000||row.observation.stopped!==false||row.observation.sequence<=last)throw Error('pacing source/property changed');
   last=row.observation.sequence;
  }
 }
 if(stop.observation.sequence<=last)throw Error('pacing cleanup stale');
 const reference=phase=>{
  const e=one('n11_pacing_reference',phase),rows=e.samples;
  if(!Array.isArray(rows)||rows.length<4)throw Error('pacing reference missing');
  let previous;
  for(const r of rows){if(!['at_ns','sequence','encoded_buffers','capture_buffers'].every(k=>safe(r[k]))||
   r.configured_fps!==30||r.negotiated_fps!==30||previous&&(r.at_ns<=previous.at_ns||r.at_ns-previous.at_ns>1.5e9||r.sequence<=previous.sequence||r.encoded_buffers<previous.encoded_buffers))throw Error('pacing reference invalid');previous=r;}
  const a=rows[0],b=rows.at(-1),duration=b.at_ns-a.at_ns;
  if(duration<2e9||phase==='healthy'&&b.at_ns>=start.at_ns||phase==='post'&&a.at_ns<=stop.at_ns)throw Error('pacing reference bounds invalid');
  return {fps:(b.encoded_buffers-a.encoded_buffers)*1e9/duration,frames:b.encoded_buffers-a.encoded_buffers,duration_ns:duration,worker_identities:e.worker_identities};
 };
 const healthy=reference('healthy'),post=reference('post'),native=events.filter(e=>e.kind==='n11_pair_native'&&e.phase==='degraded');
 const a=native[0],b=native.at(-1),frames=b.encoded_buffers-a.encoded_buffers,duration=b.at_ns-a.at_ns;
 const identity=JSON.stringify(events.find(e=>e.kind==='n11_pair_phase_started').worker_identities);
 if(JSON.stringify(healthy.worker_identities)!==identity||JSON.stringify(post.worker_identities)!==identity)throw Error('reference source changed');
 const indicators={pacing_persistent_all_phases:true,healthy_reference_adequate:healthy.frames*1e9>=27*healthy.duration_ns,
  initial_media_degradation:frames*healthy.duration_ns*100<=95*healthy.frames*duration,
  post_fault_recovery:post.frames*healthy.duration_ns*100>=95*healthy.frames*post.duration_ns};
 return {...control,scope:'engineering_pacing_feasibility_label_unavailable',native_references:{healthy,post},initial_fps:frames*1e9/duration,
  indicators,engineering_screen:Object.values(indicators).every(Boolean)?'met':'unmet',diagnostic_label:null,accepted_diagnostic_groups:0,
  recovery_attribution:'post_fault_recovery_follows_independent_fault_removal_not_probe_utility'};
}
