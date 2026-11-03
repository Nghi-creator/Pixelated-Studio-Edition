import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {exportObservedPhase,exportRawObservation} from '../n11/rawObservationExport.mjs';
import {observedPhaseOptions} from '../n11/observedPhase.mjs';
import {pairedPhaseFixture,pairedPlan} from './pairedPhaseFixture.mjs';
const runtime=fileURLToPath(new URL('../../../',import.meta.url));
function members(bytes) {
  const files={};
  const text=(o,n)=>Buffer.from(bytes.slice(o,o+n)).toString().replace(/\0.*$/s,'');
  for(let o=0;o<bytes.length&&bytes[o];){const n=text(o,100),size=parseInt(text(o+124,12),8);
    files[n]=text(o+512,size);o+=512+Math.ceil(size/512)*512;}
  return files;
}
test('default baseline export remains byte-identical to the source-local handoff',async()=>{
  const input=pairedPhaseFixture('degraded');
  const start=Date.parse(input.raw_observation.started_at),rows=input.raw_observation.browser_samples;
  for(let i=4;i<8;i++)rows.push({...rows[0],elapsedMs:i*1000,capturedAt:new Date(start+i*1000).toISOString(),framesDecoded:i*30});
  input.raw_observation.engine_snapshots=[-1,1,3,5,8].map((seconds,i)=>({...input.raw_observation.engine_snapshots[0],
    sampleSequence:i+1,sampleIntervalMs:2000,capturedAt:new Date(start+seconds*1000).toISOString(),
    encoder:{...input.raw_observation.engine_snapshots[0].encoder,framesInTotal:(100+seconds)*30,framesOutTotal:(100+seconds)*30,updatedAt:new Date(start+seconds*1000).toISOString()}}));
  const result=await exportRawObservation(runtime,input,pairedPlan);
  assert.equal(createHash('sha256').update(result.archive).digest('hex'),
    '1a64ae7df3c18deb2be676d821001960e450b73b3982bf4d77830cd193110f33');
});
test('three declared phases preserve observed settings, context and exact phase evidence',async()=>{
  const contexts=[];
  for(const [phase,fps] of [['degraded',30],['relief',24],['recovery',30]]) {
    const acquisition=pairedPhaseFixture(phase),original=JSON.stringify(acquisition);
    const result=await exportObservedPhase(runtime,acquisition,pairedPlan),files=members(result.archive);
    const metadata=JSON.parse(files['run-metadata.json']),manifest=JSON.parse(files['bundle-manifest.json']);
    assert.equal(metadata.streamProfile.fps,fps);assert.equal(metadata.runId,pairedPlan.acquisition_id+'-'+phase);
    assert.equal(manifest.phase,phase);assert.equal(manifest.comparisonCaseId,pairedPlan.acquisition_id);
    assert.equal(manifest.sourceLocalPhase.phase,phase);
    assert.equal(manifest.sourceLocalPhase.evidenceSha256,'sha256:'+createHash('sha256').update(JSON.stringify(acquisition,null,2)+'\n').digest('hex'));
    contexts.push(result.context);assert.equal(JSON.stringify(acquisition),original);
  }
  assert.deepEqual(contexts[0],contexts[1]);assert.deepEqual(contexts[0],contexts[2]);
  assert.equal(contexts[0].nominalStreamProfile.fps,30);
  assert.equal(contexts[0].versions.pixelatedAcquisitionProtocol,'n11-contained-paired-phase-v1');
});
test('phase declaration cannot retrofit read-only baselines or infer settings from requests',()=>{
  const mutations=[
    a=>delete a.method,a=>a.role='healthy',a=>a.status='failed',a=>a.raw_observation.failure='stopped',
    a=>a.raw_observation.phase='healthy',a=>a.raw_observation.phase='toString',
    a=>a.raw_observation.comparison_case_id='other',a=>a.raw_observation.version='old',
    a=>a.raw_observation.browser_samples.pop(),a=>a.raw_observation.started_at='invalid',
    a=>a.raw_observation.browser_samples[3].elapsedMs=1000,
    a=>a.raw_observation.browser_samples[0].connectionState='disconnected',
    a=>{const row=a.raw_observation.browser_samples[3];row.elapsedMs=6000;row.capturedAt=new Date(Date.parse(a.raw_observation.started_at)+6000).toISOString();},
    a=>a.raw_observation.engine_snapshots[2].encoder.targetFps=30,
    a=>a.raw_observation.engine_snapshots[0].encoder.targetFps=30, // Bad excluded prefix cannot be hidden.
    a=>delete a.raw_observation.engine_snapshots[2].encoder.targetFps,
    a=>a.raw_observation.engine_snapshots[2].encoder.targetBitrateKbps=1400,
    a=>a.raw_observation.engine_snapshots[2].encoder.available=false,
    a=>a.raw_observation.engine_snapshots[2].encoder.cpuUsed=7,
    a=>a.raw_observation.engine_snapshots.reverse(),
    a=>a.raw_observation.engine_snapshots=[],
  ];
  for(const mutate of mutations) {const a=pairedPhaseFixture('relief');mutate(a);
    assert.throws(()=>observedPhaseOptions(a,pairedPlan));}
  assert.throws(()=>observedPhaseOptions(pairedPhaseFixture('relief'),{...pairedPlan,temporal_contract:undefined}));
});

test('caller edits during asynchronous export cannot change checked phase evidence',async()=>{
  const input=pairedPhaseFixture('relief'),plan={...pairedPlan};
  const evidenceHash='sha256:'+createHash('sha256').update(JSON.stringify(input,null,2)+'\n').digest('hex');
  const pending=exportObservedPhase(runtime,input,plan);
  input.raw_observation.engine_snapshots[2].encoder.targetFps=60;
  input.raw_observation.phase='recovery';plan.acquisition_id='n11-raw-replaced';
  const files=members((await pending).archive),manifest=JSON.parse(files['bundle-manifest.json']);
  assert.equal(manifest.phase,'relief');assert.equal(manifest.comparisonCaseId,pairedPlan.acquisition_id);
  assert.equal(manifest.sourceLocalPhase.evidenceSha256,evidenceHash);
  assert.equal(JSON.parse(files['run-metadata.json']).streamProfile.fps,24);
});
