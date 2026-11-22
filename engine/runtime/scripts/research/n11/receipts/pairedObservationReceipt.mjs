/** Structural evidence checks only; no authentication, cause label or acceptance. */
export function inspectPairedAcquisition(run,{method='n11-contained-paired-observation-v1',role='engineering_no_fault_no_label'}={}){
  const phases=['degraded','relief','recovery'],targets=[30,24,30],events=run?.events;
  if(run?.status!=='passed'||run.method!==method||run.live_authority!==false||
    run.role!==role||run.paired_observation?.failure!==null||!Array.isArray(events)||
    JSON.stringify(run.paired_observation.phases?.map(p=>p.phase))!==JSON.stringify(phases))throw Error('incomplete paired acquisition');
  const only=kind=>{const found=events.filter(e=>e.kind===kind);if(found.length!==1)throw Error('unique '+kind+' required');return found[0];};
  const camera=only('camera_ready'),binding=only('control_capture_bound');
  if(camera.source!=='isolated_game'||binding.scope!=='owned_x99_game_display'||binding.live_authority!==false||
    !/^[a-f0-9]{64}$/.test(binding.binding_hash)||run.paired_observation.priming?.length!==3||
    run.paired_observation.priming.some((p,i)=>p.phase!==phases[i]||p.failure!==null))throw Error('paired capture/priming unavailable');
  const dispatch=only('n11_pair_dispatched'),result=only('n11_pair_result'),journal=only('n11_pair_journal');
  if(journal.state!=='clean'||journal.actions!==1||journal.reserved_ns!==7000000000||journal.operation_done!==true||
    !/^[a-f0-9]{64}$/.test(journal.content_hash)||JSON.stringify(journal.result)!==JSON.stringify(result.result))throw Error('terminal paired journal unavailable');
  if(dispatch.request.target_fps!==24||dispatch.request.duration_ns!==5000000000||dispatch.live_authority!==false||
    result.result.request_id!==dispatch.request.request_id||result.result.outcome!=='completed'||
    result.result.restoration!=='verified_by_port'||result.result.reason!=='duration_elapsed'||result.result.live_authority!==false||
    result.ledger_state!=='clean'||result.actions!==1||result.reserved_ns!==7000000000)throw Error('paired control/restoration unavailable');
  const starts=events.filter(e=>e.kind==='n11_pair_phase_started'),ends=events.filter(e=>e.kind==='n11_pair_phase_completed');
  if(JSON.stringify(starts.map(e=>e.phase))!==JSON.stringify(phases)||JSON.stringify(ends.map(e=>e.phase))!==JSON.stringify(phases))throw Error('whole paired phases required');
  let identity;
  for(let i=0;i<3;i++){
    const start=starts[i],end=ends[i],native=events.filter(e=>e.kind==='n11_pair_native'&&e.phase===phases[i]);
    const current=JSON.stringify(start.worker_identities);
    if(!start.worker_identities?.first||identity&&current!==identity||!Number.isSafeInteger(start.at_ns)||
       !Number.isSafeInteger(end.at_ns)||end.at_ns<=start.at_ns||native.length<2||
       i&&start.at_ns<=ends[i-1].at_ns)throw Error('paired source identity/bounds unavailable');
    identity=current;let previous;
    for(const sample of native){
      if(!['at_ns','sequence','capture_buffers','encoded_buffers'].every(k=>Number.isSafeInteger(sample[k])&&sample[k]>=0)||sample.configured_fps!==targets[i]||sample.negotiated_fps!==targets[i]||
        sample.at_ns<start.at_ns||sample.at_ns>end.at_ns||previous&&(
        sample.sequence<=previous.sequence||sample.at_ns<=previous.at_ns||sample.capture_buffers<previous.capture_buffers||sample.encoded_buffers<previous.encoded_buffers))throw Error('paired native continuity unavailable');
      previous=sample;
    }
    if(native.at(-1).capture_buffers<=native[0].capture_buffers||native.at(-1).encoded_buffers<=native[0].encoded_buffers)throw Error('native media did not advance');
  }
  if(!Number.isSafeInteger(dispatch.at_ns)||!Number.isSafeInteger(result.at_ns)||
     !Number.isSafeInteger(starts[1].action_elapsed_ns)||!Number.isSafeInteger(ends[1].action_elapsed_ns)||
     starts[1].action_elapsed_ns!==starts[1].at_ns-dispatch.at_ns||ends[1].action_elapsed_ns!==ends[1].at_ns-dispatch.at_ns||
     result.at_ns<dispatch.at_ns+5000000000||dispatch.at_ns<ends[0].at_ns||starts[1].at_ns<=dispatch.at_ns||starts[1].action_elapsed_ns>1750000000||
     ends[1].action_elapsed_ns>=5000000000||ends[1].at_ns>=result.at_ns||starts[2].at_ns<=result.at_ns)throw Error('paired action ordering/deadline unavailable');
  if(!events.some(e=>e.kind==='complete'&&e.worker_cleanup===true)||!events.some(e=>e.kind==='host_shutdown'&&e.stage==='scope_closed'))throw Error('paired cleanup unavailable');
  return {method:run.method,scope:'engineering_control_only_no_fault_no_label',restoration:'verified_by_port',
    controller_request:dispatch.request,result:result.result,ledger_state:result.ledger_state,reserved_ns:result.reserved_ns,
    phase_native_bounds:starts.map((s,i)=>({phase:s.phase,start_ns:s.at_ns,end_ns:ends[i].at_ns})),
    relief_action_bounds_ns:[starts[1].action_elapsed_ns,ends[1].action_elapsed_ns],
    live_authority:false,accepted_diagnostic_groups:0};
}
