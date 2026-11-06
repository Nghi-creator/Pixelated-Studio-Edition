/** Passive engineering trace validation; never loosens resource-source timing gates. */
import {isDeepStrictEqual as same} from 'node:util';
import {RESOURCE_METHOD,RESOURCE_ROLE,resourceClockId} from './resourceProtocol.mjs';
const METHOD='n11-resource-observer-timing-diagnostic-v1';
const COMPONENTS=['slots','target_ready','ready','identity','native_and_resource_metadata','context_emit','sampler_construct','sampler_read','ownership_witness'];
const safe=v=>Number.isSafeInteger(v)&&v>=0;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),[...keys].sort());
export function inspectResourceTimingDiagnostics(run){
 if(!['passed','failed'].includes(run?.status)||run.method!==RESOURCE_METHOD||run.role!==RESOURCE_ROLE||run.live_authority!==false||run.resource_timing_diagnostics!==METHOD||!Array.isArray(run.events)||run.events.length>10000)throw Error('explicit diagnostic acquisition required');
 const contexts=run.events.filter(e=>e.kind==='n11_resource_context');if(contexts.length!==1)throw Error('unique resource context required');
 const clock=resourceClockId(contexts[0].context),traces=run.events.filter(e=>e.kind==='n11_observer_timing');
 if(traces.length>4||run.status==='passed'&&traces.length!==4)throw Error('diagnostic trace budget/completeness');
 const counts={healthy:0,post:0},rows=[];let previousSequence=-1;
 for(const trace of traces){
  if(!exact(trace,['kind','method','phase','observer_tick_ns','reference_entry_ns','reference_exit_ns','spans','resource_sample_sequence','resource_clock_id','resource_read_start_ns','resource_read_end_ns','scope','live_authority'])||trace.method!==METHOD||!Object.hasOwn(counts,trace.phase)||++counts[trace.phase]>2||trace.live_authority!==false||trace.resource_clock_id!==clock||trace.scope!=='engineering_call_path_elapsed_not_cpu_time_or_causal_attribution'||!['observer_tick_ns','reference_entry_ns','reference_exit_ns','resource_sample_sequence','resource_read_start_ns','resource_read_end_ns'].every(k=>safe(trace[k]))||trace.observer_tick_ns>trace.reference_entry_ns||trace.reference_entry_ns>trace.resource_read_start_ns||trace.resource_read_start_ns>trace.resource_read_end_ns||trace.resource_read_end_ns>trace.reference_exit_ns||!Array.isArray(trace.spans)||trace.spans.length>24)throw Error('invalid timing trace');
  if(trace.resource_sample_sequence<=previousSequence)throw Error('diagnostic sequence reversal');previousSequence=trace.resource_sample_sequence;
  const durations={};let lastStart=-1;
  for(const span of trace.spans){
   if(!exact(span,['component','start_ns','end_ns'])||!COMPONENTS.includes(span.component)||!safe(span.start_ns)||!safe(span.end_ns)||span.start_ns<trace.reference_entry_ns||span.end_ns>trace.reference_exit_ns||span.end_ns<span.start_ns||span.start_ns<lastStart)throw Error('invalid diagnostic span');
   lastStart=span.start_ns;durations[span.component]=(durations[span.component]||[]).concat(span.end_ns-span.start_ns);
  }
  const ref=run.events.find(e=>e.kind==='n11_pacing_reference'&&e.phase===trace.phase);
  const sample=ref?.samples?.find(r=>r.container_cpu_read?.sequence===trace.resource_sample_sequence)?.container_cpu_read;
  if(run.status==='passed'&&(!sample||sample.clock_id!==trace.resource_clock_id||sample.read_start_ns!==trace.resource_read_start_ns||sample.read_end_ns!==trace.resource_read_end_ns))throw Error('timing trace not bound to measurement');
  rows.push({phase:trace.phase,sequence:trace.resource_sample_sequence,observer_to_reference_entry_ns:trace.reference_entry_ns-trace.observer_tick_ns,observer_to_read_start_ns:trace.resource_read_start_ns-trace.observer_tick_ns,read_span_ns:trace.resource_read_end_ns-trace.resource_read_start_ns,reference_elapsed_ns:trace.reference_exit_ns-trace.reference_entry_ns,nested_component_elapsed_ns:durations,source_observer_lag_within_50ms:trace.resource_read_start_ns-trace.observer_tick_ns<=50e6});
 }
 return {method:METHOD,state:run.status==='passed'?'engineering_traces_complete':'partial_engineering_traces',traces:rows,interpretation:'nested_elapsed_spans_include_scheduling_not_additive_cpu_cost_or_proof_of_os_cause',source_guards_unchanged:true,empirical_acceptance:false,acquisition_authority:false};
}
