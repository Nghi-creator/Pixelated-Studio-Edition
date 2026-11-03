import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {exportRawObservation} from '../n11/rawObservationExport.mjs';

const runtime=fileURLToPath(new URL('../../../',import.meta.url));
function source(){
  const start=Date.parse('2026-11-02T00:00:00Z');
  const browser_samples=Array.from({length:8},(_,i)=>({capturedAt:new Date(start+i*1000).toISOString(),elapsedMs:i*1000,
    sessionId:'native_acceptance',gameId:'frozen-bubble-fixture',playerMode:'host',status:'playing',fps:30,bitrateKbps:1500,
    packetsLostTotal:0,packetsLostDelta:0,jitterMs:0,iceConnectionState:'connected',connectionState:'connected',lastEngineError:null,
    availableIncomingBitrateKbps:null,roundTripTimeMs:null,decodeTimeMeanMs:1,jitterBufferDelayMeanMs:2,
    framesDecoded:i*30,framesDropped:0,freezeCount:0,freezeDurationTotalMs:0,keyFramesDecoded:1}));
  const engine_snapshots=[-1,1,3,5,8].map((seconds,i)=>({schemaVersion:1,sessionId:'native_acceptance',sampleSequence:i+1,sampleIntervalMs:1000,
    capturedAt:new Date(start+seconds*1000).toISOString(),engine:{nodeRunning:true,cameraRunning:true,emulatorRunning:true,
      nodeCpuPercent:11,nodeRssMb:12,cameraCpuPercent:21,cameraRssMb:22,emulatorCpuPercent:31,emulatorRssMb:32,
      runtimeKind:'native_linux',cpuCapacityCores:2,logicalCpuCount:8,peerCount:1},
    encoder:{available:true,error:null,framesInTotal:i*30,framesOutTotal:i*29,framesDroppedTotal:0,queueLevelBuffers:0,
      targetBitrateKbps:1500,targetFps:30,cpuUsed:6,maxQuantizer:48,pipelineDelayProxyMs:null,updatedAt:new Date(start+seconds*1000).toISOString()}}));
  return {status:'passed',browser:'test-browser',raw_observation:{started_at:new Date(start).toISOString(),browser_samples,engine_snapshots,failure:null}};
}
const plan={acquisition_id:'n11-raw-unit',producer_revision:'a'.repeat(40),source_manifest_hash:'sha256:'+'b'.repeat(64),image:'sha256:'+'c'.repeat(64)};
function members(bytes){
  const files={};
  const text=(offset,length)=>Buffer.from(bytes.slice(offset,offset+length)).toString().replace(/\0.*$/s,'');
  for(let offset=0;offset<bytes.length&&bytes[offset];){const name=text(offset,100),size=parseInt(text(offset+124,12),8);
    files[name]=text(offset+512,size);offset+=512+Math.ceil(size/512)*512;}
  return files;
}

test('raw export preserves process roles, UTC timestamps and excluded source samples',async()=>{
  const result=await exportRawObservation(runtime,source(),plan);
  assert.deepEqual(result.excluded_engine_snapshots,[{sample_sequence:1,reason:'outside_browser_wall_derived_window'},{sample_sequence:5,reason:'outside_browser_wall_derived_window'}]);
  const files=members(result.archive);
  const rows=files['engine-telemetry.csv'].split('\n');
  const columns=rows[0].split(','),values=rows[1].split(',');
  const row=Object.fromEntries(columns.map((name,i)=>[name,values[i]]));
  assert.equal(row.captured_at,'2026-11-02T00:00:01.000Z');assert.equal(row.elapsed_ms,'1000');
  assert.equal(row.node_cpu_percent,'11');assert.equal(row.camera_cpu_percent,'21');assert.equal(row.emulator_cpu_percent,'31');
  assert.equal(row.sample_sequence,'2');assert.equal(row.pipeline_delay_proxy_ms,'');
  const summary=JSON.parse(files['summary.json']);
  assert.equal(summary.recording.durationMs,7000);assert.equal(summary.validity.isValid,true);
  assert.equal(summary.validity.sources.engineRuntime.sampleCount,3);
  assert.equal(JSON.parse(files['bundle-manifest.json']).phase,'healthy');
  assert.equal(result.context.workloadId,'frozen-bubble-fixture');
});

test('missing engine source remains unavailable and failed capture is never exported',async()=>{
  const acquisition=source();acquisition.raw_observation.engine_snapshots=[];
  const files=members((await exportRawObservation(runtime,acquisition,plan)).archive);
  assert.equal(JSON.parse(files['summary.json']).validity.isValid,false);
  assert.equal(JSON.parse(files['bundle-manifest.json']).telemetrySources.engine_runtime,'unavailable');
  await assert.rejects(exportRawObservation(runtime,{...acquisition,status:'failed'},plan),/incomplete/);
  acquisition.raw_observation.engine_snapshots=source().raw_observation.engine_snapshots.reverse();
  await assert.rejects(exportRawObservation(runtime,acquisition,plan),/sequence/);
});

test('source-local export is opt-in and binds the original phase/evidence bytes',async()=>{
  const {createHash}=await import('node:crypto');
  const acquisition=source();
  const ordinary=await exportRawObservation(runtime,acquisition,plan);
  assert.equal(JSON.parse(members(ordinary.archive)['bundle-manifest.json']).sourceLocalPhase,undefined);
  assert.equal(ordinary.context.versions.pixelatedTemporalContract,undefined);
  const result=await exportRawObservation(runtime,acquisition,{...plan,temporal_contract:'source_local_stable_phase_v1'});
  const declaration=JSON.parse(members(result.archive)['bundle-manifest.json']).sourceLocalPhase;
  assert.deepEqual(declaration,{schemaVersion:'source-local-stable-phase-v1',basis:'operator_declared_not_authenticated',
    phase:'healthy',comparisonCaseId:plan.acquisition_id,elapsedStartMs:0,elapsedEndMs:7000,
    evidenceSha256:'sha256:'+createHash('sha256').update(JSON.stringify(acquisition,null,2)+'\n').digest('hex')});
  assert.equal(result.context.versions.pixelatedTemporalContract,'source_local_stable_phase_v1');
});
