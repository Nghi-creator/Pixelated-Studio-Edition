/** Independent engineering arithmetic over retained source observations; no label authentication. */
import {inspectPairedAcquisition} from './pairedObservationReceipt.mjs';
const METHOD='n11-contained-contention-paired-v1';
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function inspectContentionAcquisition(run){
  const control=inspectPairedAcquisition(run,{method:METHOD,role:'engineering_contention_label_unavailable'});
  const events=run.events;
  const one=kind=>{const rows=events.filter(e=>e.kind===kind);if(rows.length!==1)throw Error('unique '+kind+' required');return rows[0];};
  const start=one('n11_pressure_started'),cleanup=one('n11_pressure_cleanup');
  if(start.workers!==2||start.allocation_cores!==2||start.maximum_active_ns!==20e9||start.child_failsafe_ns!==40e9||
    !/^[a-f0-9]{64}$/.test(start.intent_sha256)||start.live_authority!==false||cleanup.live_authority!==false||
    start.identities?.length!==2||new Set(start.identities).size!==2||!start.identities.every(id=>/^[a-f0-9]{64}$/.test(id))||
    !integer(start.at_ns)||!integer(cleanup.at_ns)||cleanup.at_ns<=start.at_ns||cleanup.at_ns-start.at_ns>=20e9||
    cleanup.state!=='reaped'||!same(start.identities,cleanup.identities))throw Error('owned pressure lifetime/cleanup unavailable');
  const samples=events.filter(e=>e.kind==='n11_pressure_sample');
  let previous;
  for(const row of samples){
    if(!same(row.identities,start.identities)||row.active_workers!==2||row.cpu_ns?.length!==2||!row.cpu_ns.every(integer)||
      !['at_ns','read_start_ns','read_end_ns'].every(k=>integer(row[k]))||row.read_end_ns<row.read_start_ns||row.at_ns!==row.read_end_ns||
      row.read_start_ns<start.at_ns||row.read_end_ns>cleanup.at_ns||
      !['nr_periods','nr_throttled','throttled_usec'].every(k=>integer(row.cgroup?.[k]))||previous&&(
      row.read_start_ns<previous.read_end_ns||row.cpu_ns.some((v,i)=>v<previous.cpu_ns[i])||
      Object.keys(row.cgroup).some(k=>row.cgroup[k]<previous.cgroup[k])))throw Error('pressure evidence invalid/reset');
    previous=row;
  }
  const pressure=[];
  for(const phase of ['degraded','relief','recovery']){
    const bounds=control.phase_native_bounds.find(v=>v.phase===phase);
    const before=samples.filter(s=>s.phase===phase&&s.boundary==='before_start');
    const after=samples.filter(s=>s.phase===phase&&s.boundary==='after_end');
    if(before.length!==1||after.length!==1||before[0].read_end_ns>bounds.start_ns||after[0].read_start_ns<bounds.end_ns)throw Error('pressure does not span whole phase');
    const a=before[0],b=after[0],duration=b.at_ns-a.at_ns,used=b.cpu_ns.reduce((x,v,i)=>x+v-a.cpu_ns[i],0);
    if(duration<=0||used>2*duration)throw Error('invalid pressure CPU interval');
    pressure.push({phase,source_bounds_ns:[a.at_ns,b.at_ns],cpu_percent_one_core:used*100/duration,
      throttled_periods:b.cgroup.nr_throttled-a.cgroup.nr_throttled,
      throttled_usec:b.cgroup.throttled_usec-a.cgroup.throttled_usec,
      resource_indicator:used*100>=50*duration&&b.cgroup.nr_throttled>a.cgroup.nr_throttled});
  }
  const reference=phase=>{
    const found=events.filter(e=>e.kind==='n11_pressure_reference'&&e.phase===phase);
    if(found.length!==1||found[0].samples?.length<4)throw Error('native pressure reference unavailable');
    const rows=found[0].samples;let previous;
    for(const row of rows){
      if(!['at_ns','sequence','capture_buffers','encoded_buffers'].every(k=>integer(row[k]))||
        row.configured_fps!==30||row.negotiated_fps!==30||previous&&(
        row.at_ns<=previous.at_ns||row.at_ns-previous.at_ns>1500000000||row.sequence<=previous.sequence||row.capture_buffers<previous.capture_buffers||row.encoded_buffers<previous.encoded_buffers))throw Error('native reference invalid/reset');
      previous=row;
    }
    const first=rows[0],last=rows.at(-1),duration=last.at_ns-first.at_ns;
    if(duration<2e9||phase==='healthy'&&last.at_ns>=start.at_ns||phase==='post'&&first.at_ns<=cleanup.at_ns)throw Error('native reference timing invalid');
    return {bounds_ns:[first.at_ns,last.at_ns],fps:(last.encoded_buffers-first.encoded_buffers)*1e9/duration,
      frames:last.encoded_buffers-first.encoded_buffers,duration_ns:duration,worker_identities:found[0].worker_identities};
  };
  const healthy=reference('healthy'),post=reference('post');
  const native=events.filter(e=>e.kind==='n11_pair_native'&&e.phase==='degraded');
  const first=native[0],last=native.at(-1),duration=last.at_ns-first.at_ns,frames=last.encoded_buffers-first.encoded_buffers;
  if(duration<=0||!same(healthy.worker_identities,post.worker_identities)||
    !same(healthy.worker_identities,events.find(e=>e.kind==='n11_pair_phase_started').worker_identities))throw Error('reference source mismatch');
  const initialFps=frames*1e9/duration;
  const resourceMet=pressure.filter(r=>r.phase!=='recovery').every(r=>r.resource_indicator);
  const adequate=healthy.frames*1e9>=27*healthy.duration_ns;
  const degraded=frames*healthy.duration_ns*100<=95*healthy.frames*duration;
  const recovered=post.frames*healthy.duration_ns*100>=95*healthy.frames*post.duration_ns;
  return {...control,scope:'engineering_contention_feasibility_label_unavailable',pressure,
    native_references:{healthy,post},initial_fps:initialFps,
    indicators:{resource_pressure_both_phases:resourceMet,healthy_reference_adequate:adequate,
      initial_media_degradation:degraded,post_cleanup_recovery:recovered},
    engineering_screen:resourceMet&&adequate&&degraded&&recovered?'met':'unmet',
    diagnostic_label:null,label_acceptance:'unavailable_independent_review_required',accepted_diagnostic_groups:0};
}
