/** Owned page sampler only; all mutation stays in the existing native controller. */
export function pairedObservationPageScript() {
  return `
import {createWebRTCStatsParserState,parseWebRTCStats} from '/raw-stats.js';
import {createTelemetryCsvSample} from '/raw-stream.js';
const pairPhases=['degraded','relief','recovery'];
const pairPrefix=window.pairedObservationPrefix={phases:[],priming:[],failure:null};
let pairPending=null,pairBusy=false;
window.primePairedPhase=async({phase,comparisonCaseId})=>{
 if(pairBusy||pairPending||pairPrefix.failure||phase!==pairPhases[pairPrefix.phases.length])throw Error('paired phase order or reuse');
 pairBusy=true;
 const scope=active,record={phase,polls:[],engine_snapshots:[],failure:null};pairPrefix.priming.push(record);
 try {
  if(!scope||!scope.live||scope.pc.connectionState!=='connected')throw Error('paired receiver unavailable');
  let parser=createWebRTCStatsParserState();
  const parse=async()=>{const stats=await scope.pc.getStats(),rows=[];stats.forEach(r=>rows.push(r));
   const parsed=parseWebRTCStats(rows,parser);parser=parsed.state;return parsed.metrics;};
  await parse();
  const target=phase==='relief'?24:30,end=Date.now()+1100;
  while(true){
   if(active!==scope||!scope.live||scope.pc.connectionState!=='connected')throw Error('paired receiver changed');
   const response=await fetch('/n11-raw-observation',{signal:AbortSignal.timeout(750),headers:{Authorization:'Bearer '+${'RAW_TOKEN'}}});
   const body=await response.json();record.polls.push({at:new Date().toISOString(),status:response.status});record.engine_snapshots.push(body);
   if(response.ok&&body.encoder?.available&&body.encoder.targetFps===target)break;
   if(Date.now()>=end)throw Error('paired engine target deadline');
   await new Promise(r=>setTimeout(r,50));
  }
  pairPending={scope,parse,phase,comparisonCaseId};
 }catch{record.failure=pairPrefix.failure='paired_prime_failed';throw Error(record.failure);}
 finally{pairBusy=false;}
};
window.collectPairedPhase=async(phase)=>{
 if(pairBusy||!pairPending||pairPrefix.failure||phase!==pairPending.phase)throw Error('paired phase not primed');
 pairBusy=true;const {scope,parse,comparisonCaseId}=pairPending;pairPending=null;
 const startedAt=Date.now(),samples=[],engine=[],polls=[];
 const raw={version:'n11-contained-raw-samples-v1',phase,comparison_case_id:comparisonCaseId,
  started_at:new Date(startedAt).toISOString(),browser_samples:samples,engine_snapshots:engine,polls,
  clock_alignment:'none_wall_clock_derived_elapsed',failure:null};
 pairPrefix.phases.push(raw);let sequence=null;
 try{
  for(let i=0;i<4;i++){
   if(active!==scope||!scope.live||scope.pc.connectionState!=='connected')throw Error('paired receiver changed');
   const metrics=await parse();
   samples.push(createTelemetryCsvSample({gameId:'frozen-bubble-fixture',playerMode:'host',recordingStartedAt:startedAt,
    sessionId:'native_acceptance',status:'playing',telemetry:{...metrics,iceConnectionState:scope.pc.iceConnectionState,
    connectionState:scope.pc.connectionState,lastEngineError:null}}));
   const before=Date.now(),response=await fetch('/n11-raw-observation',{signal:AbortSignal.timeout(750),headers:{Authorization:'Bearer '+${'RAW_TOKEN'}}});
   const body=await response.json();polls.push({browser_request_started_at:new Date(before).toISOString(),
    browser_response_ended_at:new Date().toISOString(),status:response.status,sample_sequence:body.sampleSequence??null});
   if(body.sampleSequence!==sequence){sequence=body.sampleSequence;engine.push(body);}
   if(!response.ok||body.encoder?.targetFps!==(phase==='relief'?24:30))throw Error('paired target lost');
   if(i<3)await new Promise(r=>setTimeout(r,1000));
  }
 }catch{raw.failure=pairPrefix.failure='paired_collection_failed';}
 finally{pairBusy=false;}
 return raw;
};`;
}
