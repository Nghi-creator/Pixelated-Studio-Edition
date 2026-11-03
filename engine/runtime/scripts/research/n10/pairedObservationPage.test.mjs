import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {pairedObservationPageScript} from './pairedObservationPage.mjs';
function page(){
  let time=1000,sequence=0,target=30,fail=false;
  const scope={live:true,pc:{connectionState:'connected',iceConnectionState:'connected',getStats:async()=>new Map()}};
  const window={};
  const sandbox={window,active:scope,AbortSignal,Date:class extends Date{constructor(...a){super(...(a.length?a:[time]));}static now(){return time;}},
    setTimeout:(callback,ms)=>{time+=ms;queueMicrotask(callback);},
    createWebRTCStatsParserState:()=>({}),parseWebRTCStats:()=>({state:{},metrics:{fps:target}}),
    createTelemetryCsvSample:args=>({elapsedMs:time-args.recordingStartedAt,capturedAt:new Date(time).toISOString(),...args.telemetry}),
    fetch:async()=>({ok:!fail,status:fail?503:200,json:async()=>({sampleSequence:++sequence,encoder:{available:true,targetFps:target}})})};
  vm.runInNewContext(pairedObservationPageScript().replace(/^import .*;$/gm,'').replaceAll('RAW_TOKEN',JSON.stringify('ephemeral')),sandbox);
  return {window,scope,target:value=>target=value,fail:()=>fail=true};
}
test('paired page retains three whole four-row phases in order and refuses reuse',async()=>{
  const p=page();
  for(const phase of ['degraded','relief','recovery']){
    p.target(phase==='relief'?24:30);
    await p.window.primePairedPhase({phase,comparisonCaseId:'n11-raw-unit'});
    const raw=await p.window.collectPairedPhase(phase);
    assert.equal(raw.phase,phase);assert.equal(raw.browser_samples.length,4);assert.equal(raw.engine_snapshots.length,4);
    assert.equal(raw.browser_samples.at(-1).elapsedMs,3000);assert.equal(raw.failure,null);
    await assert.rejects(p.window.collectPairedPhase(phase),/not primed/);
  }
  assert.equal(p.window.pairedObservationPrefix.phases.length,3);
  await assert.rejects(p.window.primePairedPhase({phase:'degraded',comparisonCaseId:'n11-raw-unit'}),/order/);
});
test('paired page cannot skip priming or reorder phases',async()=>{
  const p=page();await assert.rejects(p.window.collectPairedPhase('degraded'),/not primed/);
  await assert.rejects(p.window.primePairedPhase({phase:'relief'}),/order/);
  await p.window.primePairedPhase({phase:'degraded',comparisonCaseId:'n11-raw-unit'});
  await assert.rejects(p.window.primePairedPhase({phase:'degraded'}),/reuse/);
});
test('receiver or target loss retains a failed prefix and blocks later phases',async()=>{
  for(const lose of [p=>p.scope.live=false,p=>p.target(24),p=>p.fail()]){
    const p=page();await p.window.primePairedPhase({phase:'degraded',comparisonCaseId:'n11-raw-unit'});lose(p);
    const raw=await p.window.collectPairedPhase('degraded');assert.equal(raw.failure,'paired_collection_failed');
    assert.ok(raw.browser_samples.length<4);assert.equal(p.window.pairedObservationPrefix.phases.length,1);
    await assert.rejects(p.window.primePairedPhase({phase:'relief'}));
  }
});
