/** Passive declared-source checks only; never a recognition/latency acceptance. */
import {isDeepStrictEqual as same} from 'node:util';
import {inspectConditionAcquisition} from './conditionReceipt.mjs';
import {RESOURCE_METHOD,RESOURCE_READ_METHOD,resourceClockId} from './resourceProtocol.mjs';
const PHASES=['healthy','degraded','relief','recovery','post'];
const COUNTERS=['usage_usec','user_usec','system_usec','nr_periods','nr_throttled','throttled_usec'];
const safe=v=>Number.isSafeInteger(v)&&v>=0;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&same(Object.keys(v).sort(),[...keys].sort());
export function inspectResourceConditionAcquisition(run,{condition}={}){
 const base=inspectConditionAcquisition(run,{condition,resource:true}),events=run.events;
 if(events.length>10000||events.some(e=>e.kind==='n11_pair_native'&&!PHASES.slice(1,4).includes(e.phase)||Object.hasOwn(e,'container_cpu_read')&&e.kind!=='n11_pair_native'||e.samples?.some(r=>Object.hasOwn(r,'container_cpu_read'))&&(e.kind!=='n11_pacing_reference'||!['healthy','post'].includes(e.phase))))throw Error('foreign resource sample location');
 const contexts=events.filter(e=>e.kind==='n11_resource_context');
 if(contexts.length!==1||events.some(e=>e.kind?.startsWith('n11_resource_')&&e.kind!=='n11_resource_context'))throw Error('unique resource context required');
 const record=contexts[0],context=record.context,clock=resourceClockId(context);
 if(!exact(record,['kind','method','clock_id','context','live_authority'])||record.method!==RESOURCE_METHOD||record.clock_id!==clock||record.live_authority!==false||!same(context.generation,base.controller_request.generation))throw Error('resource generation/context mismatch');
 let prior=null,identity=null,count=0,maxSpan=0;const windows={},samples={};
 const pacingStart=events.find(e=>e.kind==='n11_pacing_started'),cleanup=events.find(e=>e.kind==='n11_condition_cleanup');
 for(const phase of PHASES){
  const references=events.filter(e=>e.kind==='n11_pacing_reference'&&e.phase===phase);
  const rows=phase==='healthy'||phase==='post'?references[0]?.samples:events.filter(e=>e.kind==='n11_pair_native'&&e.phase===phase);
  if(!Array.isArray(rows)||rows.length<4||rows.length>64)throw Error('resource sample budget unavailable');
  samples[phase]=[];
  for(const row of rows){
   const r=row.container_cpu_read;
   if(!exact(r,['method','scope','clock_id','sequence','read_start_ns','read_end_ns','source_identity','quota','counters','counter_units','underlying_counter_freshness','source_authenticity','live_authority','phase'])||r.method!==RESOURCE_READ_METHOD||r.scope!=='private_container_cpu_counters_not_ownership_or_diagnosis'||r.phase!==phase||r.clock_id!==clock||r.live_authority!==false||
    r.counter_units!=='microseconds_for_usec_fields_counts_for_nr_fields'||r.underlying_counter_freshness!=='not_authenticated_by_read_brackets'||r.source_authenticity!=='declared_namespace_quota_and_file_identity_only'||
    !safe(r.read_start_ns)||!safe(r.read_end_ns)||r.read_end_ns<r.read_start_ns||r.read_end_ns-r.read_start_ns>50e6||r.sequence!==count||!safe(row.at_ns)||r.read_start_ns<row.at_ns||r.read_start_ns-row.at_ns>50e6||
    !same(r.quota,{quota_usec:200000,period_usec:100000})||!exact(r.counters,COUNTERS)||!COUNTERS.every(k=>safe(r.counters[k]))||
    !exact(r.source_identity,['cgroup','cpu.stat','cpu.max'])||!Object.values(r.source_identity).every(v=>exact(v,['device','inode'])&&safe(v.device)&&safe(v.inode)&&v.inode>0)||identity&&!same(r.source_identity,identity))throw Error('invalid resource sample/source');
   if(prior&&(r.read_start_ns<=prior.read_end_ns||!COUNTERS.every(k=>r.counters[k]>=prior.counters[k])))throw Error('resource reset or chronology failure');
   if(prior&&r.read_start_ns-prior.read_end_ns>15e9)throw Error('resource windows disconnected');
   if(samples[phase].length&&r.read_end_ns-prior.read_start_ns>1.5e9)throw Error('resource sampling gap');
   const bounds=base.phase_native_bounds.find(p=>p.phase===phase);
   if(bounds&&(r.read_start_ns<bounds.start_ns||r.read_end_ns>bounds.end_ns)||phase==='healthy'&&r.read_end_ns>=pacingStart.at_ns||phase==='post'&&r.read_start_ns<=cleanup.at_ns)throw Error('resource phase containment unavailable');
   maxSpan=Math.max(maxSpan,r.read_end_ns-r.read_start_ns);identity=r.source_identity;prior=r;count++;samples[phase].push(r);
  }
  const first=samples[phase][0],last=samples[phase].at(-1),inner=last.read_start_ns-first.read_end_ns,outer=last.read_end_ns-first.read_start_ns;
  if(inner<2e9||outer>5e9)throw Error('whole resource duration unavailable');
  windows[phase]={phase,sample_count:rows.length,read_start_ns:first.read_start_ns,read_end_ns:last.read_end_ns,inner_duration_ns:inner,outer_duration_ns:outer};
 }
 if(count>128||events.indexOf(record)>Math.min(...events.map((e,i)=>Object.hasOwn(e,'container_cpu_read')||e.samples?.some(r=>Object.hasOwn(r,'container_cpu_read'))?i:Infinity)))throw Error('resource context/budget mismatch');
 return {...base,method:'n11-resource-condition-inspection-candidate-v1',scope:'engineering_resource_observation_not_recognition_or_acceptance',resource_integrity:'verified_declared_internal_evidence',resource_context:context,resource_clock_id:clock,resource_source_identity:identity,resource_windows:Object.values(windows),resource_sample_count:count,maximum_resource_read_span_ns:maxSpan,resource_samples:samples,empirical_acceptance:false,acquisition_authority:false,accepted_diagnostic_groups:0,diagnostic_label:null};
}

export function resourceObservationArtifact(receipt,sourceSha256){
 if(receipt?.resource_integrity!=='verified_declared_internal_evidence'||typeof sourceSha256!=='string'||!/^sha256:[a-f0-9]{64}$/.test(sourceSha256))throw Error('verified resource receipt and source hash required');
 return structuredClone({method:RESOURCE_METHOD,source_payload_sha256:sourceSha256,context:receipt.resource_context,clock_id:receipt.resource_clock_id,source_identity:receipt.resource_source_identity,windows:receipt.resource_windows,samples:receipt.resource_samples,empirical_acceptance:false,acquisition_authority:false});
}
