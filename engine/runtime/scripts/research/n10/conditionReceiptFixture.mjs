/** Artificial whole-condition vectors, never actual execution or truth reviews. */
import {createHash} from 'node:crypto';
import {fixture as pacingFixture} from './pacingReceiptFixture.mjs';
import {conditionVariant} from '../n11/conditionProtocol.mjs';
export function fixture(condition){
 const run=pacingFixture(),v=conditionVariant(condition),gen=run.events.find(e=>e.kind==='n11_pair_dispatched').request.generation;
 // Preserve the old control schedule while allowing a full condition establishment.
 for(const event of run.events){
  if(event.at_ns>=4.9e9)event.at_ns+=1e8;
  for(const k of ['read_start_ns','read_end_ns'])if(event[k]>=4.9e9)event[k]+=1e8;
  if(event.kind==='n11_pacing_reference')for(const row of event.samples)if(row.at_ns>=4.9e9)row.at_ns+=1e8;
 }
 Object.assign(run,{mode:'engineering-n11-condition-'+condition,method:v.method,role:v.role});
 const clock='worker-monotonic-'+createHash('sha256').update(JSON.stringify({owner:gen.owner,peer:gen.peer,pipeline:gen.pipeline})).digest('hex');
 const refs=phase=>run.events.find(e=>e.kind==='n11_pacing_reference'&&e.phase===phase).samples;
 const native=run.events.filter(e=>e.kind==='n11_pair_native');
 const orderedNative=[...refs('healthy'),...native,...refs('post')];
 for(const [i,row] of orderedNative.entries()){
  row.sequence=i+1;row.native_read={method:'native-counter-read-brackets-v1',clock_id:clock,basis:'worker_elapsed_monotonic_ns',read_start_ns:row.at_ns-1e8,read_end_ns:row.at_ns-1e8+1e6};
 }
 for(const phase of ['degraded','recovery'])for(const [i,row] of native.filter(e=>e.phase===phase).entries())row.encoded_buffers=(phase==='degraded'?100:300)+i*(condition==='owned_identity_delay'?26:30);
 const identities=v.pressureWorkers?['a'.repeat(64),'b'.repeat(64)]:[];
 let sequence=0;
 const property=(stage,t)=>({method:v.ownedMethod,generation:gen,sequence:++sequence,worker_elapsed_ns:t-1e8,sleep_time_us:stage==='active'?v.delay:0,started:stage!=='healthy',stopped:stage==='post',expired:false,failed:false});
 const witness=(stage,t)=>{
  const active=stage==='active'&&v.pressureWorkers,reaped=stage==='post'&&v.pressureWorkers;
  return {method:'n11-owned-condition-witness-v1',condition,generation:gen,property:property(stage,t),
   property_read_start_ns:t,property_read_end_ns:t,pressure_read_start_ns:t+1,pressure_read_end_ns:t+2,
   pressure:{state:active?'active':reaped?'reaped':stage==='post'?'closed_unused':'unused',used:Boolean(active||reaped),closed:stage==='post',identities:active||reaped?identities:[],active_workers:active?2:0,
    cpu_ns:active?[Math.floor(t/2),Math.floor(t/2)]:reaped?null:[],cgroup:{nr_periods:Math.floor(t/1e8),nr_throttled:Math.floor(t/1e8),throttled_usec:Math.floor(t/1000)}},ownership_scope:'owned_fixture_registry_and_identity_only'};
 };
 for(const row of refs('healthy'))row.condition_witness=witness('healthy',row.at_ns+1000);
 run.events.find(e=>e.kind==='n11_pacing_started').observation=property('active',4e9);
 const samples=run.events.filter(e=>e.kind==='n11_pacing_sample');
 for(const phase of ['degraded','relief','recovery'])for(const boundary of ['before_start','after_end']){
  const row=samples.find(e=>e.phase===phase&&e.boundary===boundary),w=witness('active',row.read_start_ns);
  row.observation=w.property;run.events.push({kind:'n11_condition_sample',phase,boundary,witness:w});
 }
 run.events.find(e=>e.kind==='n11_pacing_cleanup').observation=property('post',19e9);
 for(const row of refs('post'))row.condition_witness=witness('post',row.at_ns+1000);
 run.events.push({kind:'n11_condition_started',condition,at_ns:4e9+1000,generation:gen,live_authority:false,
  pressure:{workers:v.pressureWorkers,maximum_active_ns:20e9,child_failsafe_ns:40e9,allocation_cores:2,identities,intent_sha256:v.pressureWorkers?'c'.repeat(64):null}},
 {kind:'n11_condition_cleanup',condition,at_ns:19.1e9+1000,state:v.pressureWorkers?'reaped':'closed_unused',identities,live_authority:false});
 return run;
}
