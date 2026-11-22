/** Fixed engineering phase export contract. No native dispatch or label authority. */
const METHOD='n11-contained-paired-phase-v1';
const FPS={degraded:30,relief:24,recovery:30};
export function observedPhaseOptions(acquisition,plan) {
  const raw=acquisition?.raw_observation;
  const phase=raw?.phase;
  if(acquisition?.status!=='passed'||acquisition.method!==METHOD||
      acquisition.role!=='engineering_pair_phase_no_label'||
      plan?.temporal_contract!=='source_local_stable_phase_v1'||
      typeof plan.acquisition_id!=='string'||!/^n11-raw-[a-z0-9-]{1,40}$/.test(plan.acquisition_id)||
      !Object.hasOwn(FPS,phase)||raw.comparison_case_id!==plan.acquisition_id||
      raw.version!=='n11-contained-raw-samples-v1'||raw.failure!==null||
      raw.browser_samples?.length!==4||!Array.isArray(raw.engine_snapshots))
    throw Error('explicit fresh paired phase required');
  const origin=Date.parse(raw.started_at),samples=raw.browser_samples;
  if(!Number.isFinite(origin))throw Error('invalid phase origin');
  let previous=-Infinity;
  for(const row of samples) {
    if(!Number.isFinite(row.elapsedMs)||row.elapsedMs<0||row.elapsedMs<=previous||
        Date.parse(row.capturedAt)-origin!==row.elapsedMs||row.sessionId!=='native_acceptance'||
        row.gameId!=='frozen-bubble-fixture'||row.connectionState!=='connected'||
        row.status!=='playing'||row.lastEngineError!==null)
      throw Error('invalid whole-phase browser evidence');
    previous=row.elapsedMs;
  }
  const first=samples[0].elapsedMs,last=samples.at(-1).elapsedMs;
  if(last-first<1000||last-first>4000)throw Error('unsupported phase duration');
  let lastTime=-Infinity,lastSequence=-1;
  const included=[];
  for(const row of raw.engine_snapshots) {
    const time=Date.parse(row.capturedAt)-origin,encoder=row.encoder;
    // Check the entire retained prefix, not just rows falling inside export bounds.
    if(!Number.isFinite(time)||time<=lastTime||!Number.isSafeInteger(row.sampleSequence)||
        row.sampleSequence<=lastSequence||row.schemaVersion!==1||row.sessionId!=='native_acceptance'||
        encoder?.available!==true||encoder.error!==null||encoder.targetFps!==FPS[phase]||
        encoder.targetBitrateKbps!==1500||encoder.cpuUsed!==6||encoder.maxQuantizer!==48)
      throw Error('missing or changing observed phase settings');
    lastTime=time;lastSequence=row.sampleSequence;
    if(time>=first&&time<=last)included.push(time);
  }
  if(included.length<2||included.at(-1)-included[0]<1000)
    throw Error('insufficient native phase span');
  return {phase,sampleCount:4,runId:plan.acquisition_id+'-'+phase,
    profile:{id:'balanced',fps:FPS[phase],bitrateKbps:1500}};
}
