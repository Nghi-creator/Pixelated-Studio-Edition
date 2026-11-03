/** Existing v2 writers on actual contained observations; no label or pair bridge. */
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export async function exportRawObservation(runtime, acquisition, plan) {
  const raw = acquisition.raw_observation;
  if (acquisition.status !== 'passed' || raw?.browser_samples?.length !== 8 || raw.failure) throw Error('incomplete raw acquisition');
  const web = path.resolve(runtime,'../../apps/web/src/features/player');
  const load = relative => import(pathToFileURL(path.join(web,relative)));
  const {createEngineResearchTelemetrySamples,parseEngineResearchTelemetryResponse} = await load('telemetry/engineResearchTelemetry.ts');
  const {createResearchRunSummary} = await load('research/researchRunSummary.ts');
  const {createResearchRunExportArtifacts} = await load('research/researchRunExportArtifacts.ts');
  const {createResearchRunBundleTar} = await load('research/researchRunBundle.ts');
  const samples = raw.browser_samples;
  const started = Date.parse(raw.started_at);
  const excluded = [], engineSamples = [];
  let sequence = -1;
  for (const original of raw.engine_snapshots) {
    const response = parseEngineResearchTelemetryResponse(original,'native_acceptance');
    if (!response || !Number.isSafeInteger(response.sampleSequence) || response.sampleSequence <= sequence) throw Error('invalid raw engine sequence');
    sequence = response.sampleSequence;
    const elapsedMs = Date.parse(response.capturedAt) - started;
    if (elapsedMs < 0 || elapsedMs > samples.at(-1).elapsedMs) {
      excluded.push({sample_sequence:sequence,reason:'outside_browser_wall_derived_window'});
      continue;
    }
    engineSamples.push(...createEngineResearchTelemetrySamples({elapsedMs,gameId:'frozen-bubble-fixture',response,runId:plan.acquisition_id}));
  }
  const first=samples[0], last=samples.at(-1), recordedAt=new Date(last.capturedAt);
  const events=[
    {capturedAt:first.capturedAt,elapsedMs:first.elapsedMs,runId:plan.acquisition_id,sessionId:'native_acceptance',name:'research_recording_started',details:null},
    {capturedAt:last.capturedAt,elapsedMs:last.elapsedMs,runId:plan.acquisition_id,sessionId:'native_acceptance',name:'research_recording_completed',details:null},
  ];
  const metadata={schemaVersion:1,capturedAt:last.capturedAt,client:{userAgent:acquisition.browser},
    game:{id:'frozen-bubble-fixture',title:'Contained seeded Frozen-Bubble level 1'},networkType:'local-docker-bridge',playerMode:'host',
    runId:plan.acquisition_id,scenario:'localhost',sessionId:'native_acceptance',status:'playing',
    streamProfile:{id:'balanced',fps:30,bitrateKbps:1500},trial:{coldStart:false}};
  const summary=createResearchRunSummary({events,generatedAt:recordedAt,engineSamples,requiresComputeTelemetry:true,runId:plan.acquisition_id,samples,sessionId:'native_acceptance'});
  const files=createResearchRunExportArtifacts({comparisonCaseId:plan.acquisition_id,engineSamples,events,graphPng:null,
    metadataJson:JSON.stringify(metadata,null,2)+'\n',phase:'healthy',recordedAt,runId:plan.acquisition_id,samples,summaryJson:JSON.stringify(summary,null,2)+'\n'});
  // The exporter permits an optional declared producer version. Actual changed
  // source bytes are separately frozen by the plan, never inferred from Git.
  const manifest=JSON.parse(files[0].data);manifest.producerVersion=plan.producer_revision;
  if(plan.temporal_contract==='source_local_stable_phase_v1') {
    manifest.sourceLocalPhase={schemaVersion:'source-local-stable-phase-v1',basis:'operator_declared_not_authenticated',
      phase:'healthy',comparisonCaseId:plan.acquisition_id,elapsedStartMs:first.elapsedMs,elapsedEndMs:last.elapsedMs,
      evidenceSha256:'sha256:'+createHash('sha256').update(JSON.stringify(acquisition,null,2)+'\n').digest('hex')};
  }
  files[0].data=JSON.stringify(manifest,null,2)+'\n';
  const context={captureImplementation:'pixelated-browser-webrtc-stats-plus-engine-v2',clientClass:'contained-chromium-'+acquisition.browser,
    compatibilityGroup:'contained-native-raw-v1',connectionMode:'loopback-signaling-docker-ice',contextId:plan.acquisition_id+'-context',
    edgeNodeClass:'docker-desktop-linux-fixture',encoderFamily:'vp8',encoderProfile:'balanced',networkScenario:'local-docker-bridge',
    nodeId:'contained-node-001',nominalStreamProfile:{bitrateKbps:1500,fps:30,id:'balanced'},operatingSystem:'container-linux',
    runtimeClass:'contained-native-engine-fixture',transportImplementation:'gstreamer-webrtc',workloadId:'frozen-bubble-fixture',
    versions:{pixelatedBundleSchema:'2',pixelatedSourceRevision:plan.producer_revision,n11SourceManifest:plan.source_manifest_hash,nativeImage:plan.image,
      fixture:'fixed_perl_srand_v1_seed_1'}};
  if(plan.temporal_contract==='source_local_stable_phase_v1') {
    context.versions.pixelatedTemporalContract='source_local_stable_phase_v1';
    context.compatibilityGroup='contained-native-source-local-v1';
  }
  return {archive:createResearchRunBundleTar(files,recordedAt),context,excluded_engine_snapshots:excluded,
    clocks:'original_browser_and_engine_utc_wall_derived_elapsed_not_clock_alignment'};
}
