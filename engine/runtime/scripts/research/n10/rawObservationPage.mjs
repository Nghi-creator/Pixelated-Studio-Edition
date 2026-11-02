/** Executes only in the owned receiver; original browser times are retained. */
export function rawObservationPageScript() {
  return `
import {createWebRTCStatsParserState,parseWebRTCStats} from '/raw-stats.js';
import {createTelemetryCsvSample} from '/raw-stream.js';
let rawRunning=false;
window.collectRawObservation=async()=>{
 if(rawRunning)throw Error('raw collection is single use');rawRunning=true;
 const scope=active;if(!scope||scope.pc.connectionState!=='connected')throw Error('raw receiver unavailable');
 let parser=createWebRTCStatsParserState();const samples=[],engine=[],polls=[];
 const parse=async()=>{const stats=await scope.pc.getStats();const records=[];stats.forEach(r=>records.push(r));
  const parsed=parseWebRTCStats(records,parser);parser=parsed.state;return parsed.metrics;};
 await parse();await new Promise(r=>setTimeout(r,1000));
 const startedAt=Date.now();let sequence=null,failure=null;
 const prefix=window.rawObservationPrefix={version:'n11-contained-raw-samples-v1',started_at:new Date(startedAt).toISOString(),browser_samples:samples,engine_snapshots:engine,polls,clock_alignment:'none_wall_clock_derived_elapsed',failure:null};
 try {
 for(let i=0;i<8;i++){
  if(active!==scope||!scope.live||scope.pc.connectionState!=='connected')throw Error('raw receiver changed');
  const metrics=await parse();
  samples.push(createTelemetryCsvSample({gameId:'frozen-bubble-fixture',playerMode:'host',
   recordingStartedAt:startedAt,sessionId:'native_acceptance',status:'playing',
   telemetry:{...metrics,iceConnectionState:scope.pc.iceConnectionState,connectionState:scope.pc.connectionState,lastEngineError:null}}));
  const before=Date.now();const response=await fetch('/n11-raw-observation',{signal:AbortSignal.timeout(1500),headers:{Authorization:'Bearer '+${'RAW_TOKEN'}}});
  const body=await response.json();const after=Date.now();
  polls.push({browser_request_started_at:new Date(before).toISOString(),browser_response_ended_at:new Date(after).toISOString(),status:response.status,
   sample_sequence:body.sampleSequence??null});
  if(response.ok&&body.sampleSequence!==sequence){sequence=body.sampleSequence;engine.push(body);}
  if(i<7)await new Promise(r=>setTimeout(r,1000));
 }
 } catch {failure='raw_collection_failed';}
 prefix.failure=failure;return prefix;
};`;
}
