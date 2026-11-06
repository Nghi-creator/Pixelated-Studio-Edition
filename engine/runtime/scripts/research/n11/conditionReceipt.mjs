/** Owned fixture evidence only; no broad cause label or reviewer authentication. */
import {isDeepStrictEqual as same} from 'node:util';
import {resourceMode} from './resourceProtocol.mjs';
import {conditionVariant} from './conditionProtocol.mjs';
import {inspectPacingAcquisition} from './pacingReceipt.mjs';
export function inspectConditionAcquisition(run,{condition,resource=false}={}){
 const variant=conditionVariant(condition),base=inspectPacingAcquisition(run,{condition,requireNativeReads:true,requireReferenceReads:true,resource});
 if(run.mode!==(resource?resourceMode(condition):'engineering-n11-condition-'+condition))throw Error('condition mode mismatch');
 const events=run.events,safe=v=>Number.isSafeInteger(v)&&v>=0;
 const only=(kind,phase)=>{const rows=events.filter(e=>e.kind===kind&&(phase===undefined||e.phase===phase));if(rows.length!==1)throw Error('unique condition evidence required');return rows[0];};
 if(events.some(e=>e.kind?.startsWith('n11_pressure_')||e.kind==='n11_pacing_fixture_failure'||e.kind?.startsWith('n11_condition_')&&!['n11_condition_started','n11_condition_sample','n11_condition_cleanup'].includes(e.kind)))throw Error('foreign condition evidence');
 if(!resource&&events.some(e=>e.kind?.startsWith('n11_resource_')||Object.hasOwn(e,'container_cpu_read')||e.samples?.some(r=>Object.hasOwn(r,'container_cpu_read'))))throw Error('resource data requires explicit resource inspector');
 const start=only('n11_condition_started'),cleanup=only('n11_condition_cleanup'),pacingStart=only('n11_pacing_started'),pacingStop=only('n11_pacing_cleanup');
 const generation=base.controller_request.generation;
 if(start.condition!==condition||cleanup.condition!==condition||start.live_authority!==false||cleanup.live_authority!==false||!same(start.generation,generation)||
    !safe(start.at_ns)||!safe(cleanup.at_ns)||start.at_ns<pacingStart.at_ns||cleanup.at_ns<pacingStop.at_ns||cleanup.at_ns<=start.at_ns||cleanup.at_ns-pacingStart.at_ns>=20e9)throw Error('condition lifetime/source unavailable');
 const p=start.pressure;
 if(!p||Object.keys(p).length!==6||p.workers!==variant.pressureWorkers||p.maximum_active_ns!==20e9||p.child_failsafe_ns!==40e9||p.allocation_cores!==2||!Array.isArray(p.identities)||p.identities.length!==variant.pressureWorkers||new Set(p.identities).size!==p.identities.length||!p.identities.every(id=>/^[a-f0-9]{64}$/.test(id))||
    (variant.pressureWorkers?!/^[a-f0-9]{64}$/.test(p.intent_sha256||''):p.intent_sha256!==null)||!same(cleanup.identities,p.identities)||cleanup.state!==(variant.pressureWorkers?'reaped':'closed_unused'))throw Error('owned condition pressure unavailable');
 const samples=events.filter(e=>e.kind==='n11_condition_sample');
 const order=['degraded','relief','recovery'].flatMap(phase=>['before_start','after_end'].map(boundary=>[phase,boundary]));
 if(!same(samples.map(s=>[s.phase,s.boundary]),order))throw Error('whole condition support required');
 let lastPropertySequence=-1,lastWorkerElapsed=-1,lastReadEnd=-1,lastCgroup=null,lastCpu=null;
 const property=(o,stage)=>{
  const expectedDelay=stage==='active'?variant.delay:0;
  if(!o||Object.keys(o).length!==9||o.method!==variant.ownedMethod||!same(o.generation,generation)||!safe(o.sequence)||o.sequence<=lastPropertySequence||!safe(o.worker_elapsed_ns)||o.worker_elapsed_ns<=lastWorkerElapsed||o.sleep_time_us!==expectedDelay||o.expired!==false||o.failed!==false||o.started!==(stage!=='healthy')||o.stopped!==(stage==='post'))throw Error('condition pacing acknowledgement invalid');
  lastPropertySequence=o.sequence;lastWorkerElapsed=o.worker_elapsed_ns;
 };
 const witness=(w,stage)=>{
  if(!w||Object.keys(w).length!==10||w.method!=='n11-owned-condition-witness-v1'||w.condition!==condition||!same(w.generation,generation)||w.ownership_scope!=='owned_fixture_registry_and_identity_only'||
   !['property_read_start_ns','property_read_end_ns','pressure_read_start_ns','pressure_read_end_ns'].every(k=>safe(w[k]))||w.property_read_start_ns<=lastReadEnd||w.property_read_end_ns<w.property_read_start_ns||w.pressure_read_start_ns<w.property_read_end_ns||w.pressure_read_end_ns<w.pressure_read_start_ns)throw Error('condition read evidence invalid');
  lastReadEnd=w.pressure_read_end_ns;property(w.property,stage);
  const a=w.pressure,positive=Boolean(variant.pressureWorkers),active=stage==='active'&&positive,reaped=stage==='post'&&positive;
  const state=active?'active':reaped?'reaped':stage==='post'?'closed_unused':'unused';
  if(!a||Object.keys(a).length!==7||a.state!==state||a.used!==(active||reaped)||a.closed!==(stage==='post')||a.active_workers!==(active?2:0)||!same(a.identities,active||reaped?p.identities:[])||
    !a.cgroup||Object.keys(a.cgroup).length!==3||!['nr_periods','nr_throttled','throttled_usec'].every(k=>safe(a.cgroup[k])&&(!lastCgroup||a.cgroup[k]>=lastCgroup[k])))throw Error('condition registry changed/reset');
  lastCgroup=a.cgroup;
  if(active){
   if(!Array.isArray(a.cpu_ns)||a.cpu_ns.length!==2||!a.cpu_ns.every((v,i)=>safe(v)&&(!lastCpu||v>=lastCpu[i])))throw Error('condition owned CPU evidence invalid');
   lastCpu=a.cpu_ns;
  }else if(!same(a.cpu_ns,reaped?null:[]))throw Error('inactive CPU evidence must remain explicit');
 };
 const refs=phase=>only('n11_pacing_reference',phase).samples;
 for(const row of refs('healthy')){
  witness(row.condition_witness,'healthy');if(row.condition_witness.pressure_read_end_ns>=pacingStart.at_ns)throw Error('condition preimage outside reference');
 }
 property(pacingStart.observation,'active');
 if(samples[0].witness?.property_read_start_ns<start.at_ns+1e9)throw Error('condition establishment unavailable');
 const phaseResources=[];
 for(const [index,sample] of samples.entries()){
  const w=sample.witness;witness(w,'active');
  const original=events.filter(e=>e.kind==='n11_pacing_sample'&&e.phase===sample.phase&&e.boundary===sample.boundary);
  if(original.length!==1||!same(original[0].observation,w.property)||original[0].read_start_ns!==w.property_read_start_ns||original[0].read_end_ns!==w.property_read_end_ns)throw Error('condition property/phase binding mismatch');
  const bounds=base.phase_native_bounds.find(v=>v.phase===sample.phase);
  if(index%2===0?(w.property_read_start_ns<start.at_ns||w.pressure_read_end_ns>bounds.start_ns):(w.property_read_start_ns<bounds.end_ns||w.pressure_read_end_ns>pacingStop.at_ns))throw Error('condition does not span phase');
  if(index%2===1&&variant.pressureWorkers){
   const a=samples[index-1].witness,b=w,duration=b.pressure_read_end_ns-a.pressure_read_end_ns,used=b.pressure.cpu_ns.reduce((sum,v,i)=>sum+v-a.pressure.cpu_ns[i],0);
   if(duration<=0||used>2*duration)throw Error('invalid owned CPU interval');
   phaseResources.push({phase:sample.phase,cpu_percent_one_core:used*100/duration,throttled_periods:b.pressure.cgroup.nr_throttled-a.pressure.cgroup.nr_throttled,resource_indicator:used*100>=50*duration&&b.pressure.cgroup.nr_throttled>a.pressure.cgroup.nr_throttled});
  }
 }
 property(pacingStop.observation,'post');
 for(const row of refs('post')){
  witness(row.condition_witness,'post');if(row.condition_witness.property_read_start_ns<=cleanup.at_ns)throw Error('condition post reference before cleanup');
 }
 return {...base,scope:'engineering_condition_witness_no_label_or_independence_acceptance',condition,condition_integrity:'verified_declared_internal_evidence',
  absence_scope:'owned_fixture_registry_and_identity_only_not_global_host_health',phase_resources:phaseResources,
  label_acceptance:'unavailable_independent_review_required',accepted_diagnostic_groups:0,diagnostic_label:null};
}
