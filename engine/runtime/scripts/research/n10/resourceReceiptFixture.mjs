/** Synthetic resource records only; never a native acquisition. */
import {fixture as conditionFixture} from './conditionReceiptFixture.mjs';
import {RESOURCE_METHOD,RESOURCE_ROLE,RESOURCE_READ_METHOD,resourceMode,resourceClockId} from '../n11/resourceProtocol.mjs';
export function fixture(condition='no_injected_fault'){
 const run=conditionFixture(condition);
 Object.assign(run,{method:RESOURCE_METHOD,role:RESOURCE_ROLE,mode:resourceMode(condition)});
 const generation=run.events.find(e=>e.kind==='n11_pair_dispatched').request.generation;
 const context={method:RESOURCE_METHOD,generation,controller_origin_ns:'1234567890123456789'},clock_id=resourceClockId(context);
 run.events.unshift({kind:'n11_resource_context',method:RESOURCE_METHOD,context,clock_id,live_authority:false});
 // Extend only this invented fixture to four endpoint-spanning native samples.
 for(const phase of ['degraded','relief','recovery']){
  const rows=run.events.filter(e=>e.kind==='n11_pair_native'&&e.phase===phase),last=rows.at(-1),previous=rows.at(-2),extra=structuredClone(last);
  extra.at_ns+=1e9;extra.native_read.read_start_ns+=1e9;extra.native_read.read_end_ns+=1e9;
  extra.encoded_buffers+=last.encoded_buffers-previous.encoded_buffers;extra.capture_buffers+=last.capture_buffers-previous.capture_buffers;
  run.events.splice(run.events.indexOf(last)+1,0,extra);
 }
 let workerSequence=0;
 for(const phase of ['healthy','degraded','relief','recovery','post']){
  const rows=['healthy','post'].includes(phase)?run.events.find(e=>e.kind==='n11_pacing_reference'&&e.phase===phase).samples:run.events.filter(e=>e.kind==='n11_pair_native'&&e.phase===phase);
  for(const row of rows)row.sequence=++workerSequence;
 }
 const source_identity={cgroup:{device:1,inode:1},'cpu.stat':{device:1,inode:2},'cpu.max':{device:1,inode:3}};
 let sequence=0;
 for(const phase of ['healthy','degraded','relief','recovery','post']){
  const rows=['healthy','post'].includes(phase)?run.events.find(e=>e.kind==='n11_pacing_reference'&&e.phase===phase).samples:run.events.filter(e=>e.kind==='n11_pair_native'&&e.phase===phase);
  rows.forEach((row,i)=>{
   const start=row.at_ns+1000+(i===rows.length-1&&['healthy','post'].includes(phase)?1e6:0);
   row.container_cpu_read={method:RESOURCE_READ_METHOD,scope:'private_container_cpu_counters_not_ownership_or_diagnosis',phase,clock_id,sequence:sequence++,read_start_ns:start,read_end_ns:start+1000,source_identity:structuredClone(source_identity),quota:{quota_usec:200000,period_usec:100000},counters:{usage_usec:sequence*1000,user_usec:sequence*700,system_usec:sequence*300,nr_periods:sequence,nr_throttled:sequence,throttled_usec:sequence*10},counter_units:'microseconds_for_usec_fields_counts_for_nr_fields',underlying_counter_freshness:'not_authenticated_by_read_brackets',source_authenticity:'declared_namespace_quota_and_file_identity_only',live_authority:false};
  });
  if(!['healthy','post'].includes(phase)){
   const end=run.events.find(e=>e.kind==='n11_pair_phase_completed'&&e.phase===phase);
   end.at_ns+=100000;
   if(phase==='relief')end.action_elapsed_ns=end.at_ns-run.events.find(e=>e.kind==='n11_pair_dispatched').at_ns;
  }
 }
 const dispatch=run.events.find(e=>e.kind==='n11_pair_dispatched');dispatch.at_ns+=100000;
 for(const e of run.events.filter(e=>['n11_pair_phase_started','n11_pair_phase_completed'].includes(e.kind)&&e.phase==='relief'))e.action_elapsed_ns=e.at_ns-dispatch.at_ns;
 return run;
}
