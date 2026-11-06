/** Invented timing events, never actual native performance evidence. */
import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture as resourceFixture} from './resourceReceiptFixture.mjs';
import {inspectResourceTimingDiagnostics as inspect} from '../n11/resourceTimingReceipt.mjs';
import {runNativeBrowserAcceptance} from './nativeBrowserAcceptance.mjs';
function fixture(){
 const run=resourceFixture();run.resource_timing_diagnostics='n11-resource-observer-timing-diagnostic-v1';
 for(const phase of ['healthy','post'])for(const row of run.events.find(e=>e.kind==='n11_pacing_reference'&&e.phase===phase).samples.slice(0,2)){
  const r=row.container_cpu_read;run.events.push({kind:'n11_observer_timing',method:run.resource_timing_diagnostics,phase,observer_tick_ns:row.at_ns,reference_entry_ns:row.at_ns+1,reference_exit_ns:r.read_end_ns+10,spans:[{component:'ready',start_ns:row.at_ns+1,end_ns:row.at_ns+500},{component:'sampler_read',start_ns:r.read_start_ns,end_ns:r.read_end_ns}],resource_sample_sequence:r.sequence,resource_clock_id:r.clock_id,resource_read_start_ns:r.read_start_ns,resource_read_end_ns:r.read_end_ns,scope:'engineering_call_path_elapsed_not_cpu_time_or_causal_attribution',live_authority:false});
 }
 return run;
}
test('diagnostic traces bind their original CPU samples without source acceptance',()=>{
 const run=fixture(),before=structuredClone(run),result=inspect(run);assert.deepEqual(run,before);assert.equal(result.traces.length,4);assert.equal(result.empirical_acceptance,false);assert.equal(result.acquisition_authority,false);
});
for(const kind of ['missing','extra','clock','span','label','unbound','duplicate'])test('diagnostic inspector rejects '+kind,()=>{
 const run=fixture(),trace=run.events.find(e=>e.kind==='n11_observer_timing');
 if(kind==='missing')run.events.splice(run.events.indexOf(trace),1);
 else if(kind==='extra')trace.spans=Array.from({length:25},()=>trace.spans[0]);
 else if(kind==='clock')trace.resource_clock_id='controller-monotonic-'+'f'.repeat(64);
 else if(kind==='span')trace.spans[0].end_ns=trace.reference_exit_ns+1;
 else if(kind==='label')trace.condition='owned_cpu_pressure';
 else if(kind==='unbound')trace.resource_read_start_ns++;
 else run.events.push(structuredClone(trace));
 assert.throws(()=>inspect(run));
});
test('diagnostic launch requires explicit typed resource opt-in before native work',async()=>{
 const image='sha256:'+'a'.repeat(64);
 await assert.rejects(runNativeBrowserAcceptance(image,'engineering-n11-condition-no_injected_fault',{resourceTimingDiagnostics:true}),/explicit resource timing/);
 await assert.rejects(runNativeBrowserAcceptance(image,'engineering-n11-resource-condition-no_injected_fault',{resourceTimingDiagnostics:'yes'}),/explicit resource timing/);
});
