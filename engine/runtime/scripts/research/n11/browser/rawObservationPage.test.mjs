import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {rawObservationPageScript} from './rawObservationPage.mjs';

async function run(failAt=Infinity) {
  let reads=0,time=1000;
  const active={live:true,pc:{connectionState:'connected',iceConnectionState:'connected',getStats:async()=>{
    if(++reads===failAt)throw Error('receiver lost');return new Map();}}};
  const window={};
  const code=rawObservationPageScript().replace(/^import .*;$/gm,'').replace('RAW_TOKEN',JSON.stringify('ephemeral'));
  const sandbox={window,active,Date:class extends Date {static now(){return time+=1000;}},
    setTimeout:cb=>queueMicrotask(cb),AbortSignal,
    createWebRTCStatsParserState:()=>({}),parseWebRTCStats:()=>({state:{},metrics:{fps:30}}),
    createTelemetryCsvSample:sample=>({elapsedMs:1000,capturedAt:'2026-11-02T00:00:00Z',...sample.telemetry}),
    fetch:async()=>({ok:true,status:200,json:async()=>({sampleSequence:1})})};
  vm.runInNewContext(code,sandbox);
  const result=await window.collectRawObservation();
  return {result,window};
}

test('raw browser collection is bounded, single-use and keeps cached sequence only once',async()=>{
  const {result,window}=await run();
  assert.equal(result.browser_samples.length,8);assert.equal(result.polls.length,8);
  assert.equal(result.engine_snapshots.length,1);assert.equal(result.failure,null);
  await assert.rejects(window.collectRawObservation(),/single use/);
});

test('receiver stats failure retains a partial prefix without a successful count',async()=>{
  const {result}=await run(4);
  assert.equal(result.browser_samples.length,2);assert.equal(result.polls.length,2);
  assert.equal(result.failure,'raw_collection_failed');
});
