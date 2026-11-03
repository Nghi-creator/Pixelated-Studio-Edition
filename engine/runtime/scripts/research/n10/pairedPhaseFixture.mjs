/** Explicit invented telemetry for the phase exporter; never a runtime receipt. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {exportObservedPhase} from '../n11/rawObservationExport.mjs';
export const pairedPlan={acquisition_id:'n11-raw-paired-fixture',producer_revision:'a'.repeat(40),
  source_manifest_hash:'sha256:'+'b'.repeat(64),image:'sha256:'+'c'.repeat(64),
  temporal_contract:'source_local_stable_phase_v1'};
export function pairedPhaseFixture(phase) {
  const index=['degraded','relief','recovery'].indexOf(phase);
  if(index<0)throw Error('fixture phase');
  const fps=phase==='relief'?24:30,start=Date.parse('2026-11-03T00:00:00Z')+index*20000;
  const browser_samples=Array.from({length:4},(_,i)=>({capturedAt:new Date(start+i*1000).toISOString(),elapsedMs:i*1000,
    sessionId:'native_acceptance',gameId:'frozen-bubble-fixture',playerMode:'host',status:'playing',fps,bitrateKbps:1500,
    packetsLostTotal:0,packetsLostDelta:0,jitterMs:0,iceConnectionState:'connected',connectionState:'connected',lastEngineError:null,
    availableIncomingBitrateKbps:null,roundTripTimeMs:null,decodeTimeMeanMs:1,jitterBufferDelayMeanMs:2,
    framesDecoded:i*fps,framesDropped:0,freezeCount:0,freezeDurationTotalMs:0,keyFramesDecoded:1}));
  const engine_snapshots=[-1,0.5,1.5,2.5,4].map((seconds,i)=>({schemaVersion:1,sessionId:'native_acceptance',sampleSequence:index*10+i+1,sampleIntervalMs:1000,
    capturedAt:new Date(start+seconds*1000).toISOString(),engine:{nodeRunning:true,cameraRunning:true,emulatorRunning:true,
      nodeCpuPercent:11,nodeRssMb:12,cameraCpuPercent:21,cameraRssMb:22,emulatorCpuPercent:31,emulatorRssMb:32,
      runtimeKind:'native_linux',cpuCapacityCores:2,logicalCpuCount:8,peerCount:1},
    encoder:{available:true,error:null,framesInTotal:(100+seconds)*fps,framesOutTotal:(100+seconds)*fps,framesDroppedTotal:0,queueLevelBuffers:0,
      targetBitrateKbps:1500,targetFps:fps,cpuUsed:6,maxQuantizer:48,pipelineDelayProxyMs:null,updatedAt:new Date(start+seconds*1000).toISOString()}}));
  return {status:'passed',method:'n11-contained-paired-phase-v1',role:'engineering_pair_phase_no_label',browser:'invented-fixture-browser',
    raw_observation:{version:'n11-contained-raw-samples-v1',phase,comparison_case_id:pairedPlan.acquisition_id,
      started_at:new Date(start).toISOString(),browser_samples,engine_snapshots,failure:null}};
}
export async function writePairedPhaseFixtures(directory) {
  const runtime=fileURLToPath(new URL('../../../',import.meta.url));
  for(const phase of ['degraded','relief','recovery']) {
    const acquisition=pairedPhaseFixture(phase),result=await exportObservedPhase(runtime,acquisition,pairedPlan);
    for(const [name,bytes] of [[phase+'.tar',result.archive],[phase+'-acquisition.json',JSON.stringify(acquisition,null,2)+'\n'],
      [phase+'-context.json',JSON.stringify(result.context,null,2)+'\n']])
      await fs.writeFile(path.join(directory,name),bytes,{flag:'wx'});
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==3)throw Error('explicit existing output directory required');
  await writePairedPhaseFixtures(process.argv[2]);
}
