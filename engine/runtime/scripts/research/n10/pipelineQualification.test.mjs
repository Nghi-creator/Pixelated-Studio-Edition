import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPipelineQualification} from '../n11/pipelineQualification.mjs';

const json = v => JSON.stringify(v, null, 2) + '\n';
const sha = v => 'sha256:' + createHash('sha256').update(v).digest('hex');
const runner = fileURLToPath(new URL('../n11/pipelineQualification.mjs', import.meta.url));
const engineering = fileURLToPath(new URL('../n11/conditionEngineering.mjs', import.meta.url));
async function fixture(t, available = true) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'n11-pipeline-test-'));
  t.after(() => fs.rm(directory, {recursive:true,force:true}));
  const processor = path.join(directory, 'processor.py'); await fs.writeFile(processor, 'fixture');
  const sources = {fixture:'a'.repeat(64)}, sourceManifestHash = sha(json(sources));
  const config = {pipelineQualification:'n11-engineering-pipeline-qualification-v1',
    scope:'engineering_only_no_study_admission', retryAllowed:false, maximumAcquisitions:36,
    directory, coreDirectory:directory, python:process.execPath, processor, sessionId:'one-session',
    sourceManifestHash, verificationCommand:[process.execPath, 'fixture-verify'], cases:[],
    dependencyFiles:{[runner]:sha(await fs.readFile(runner)), [engineering]:sha(await fs.readFile(engineering)),
      [processor]:sha(await fs.readFile(processor))}};
  for (let i=0;i<36;i++) {
    const id = 'n11-raw-eng-pipe-test-'+i, plan = path.join(directory, id+'.json');
    const value = {acquisition_id:id, schema_version:'n11-contained-resource-condition-plan-v1',
      source_manifest_hash:sourceManifestHash, condition:{name:'fixture-condition'}};
    await fs.writeFile(plan, json(value));
    config.cases.push({id, condition:'fixture-condition', plan, planSha256:sha(json(value)),
      output:path.join(directory,'cases',String(i+1)), block_id:'block-'+Math.floor(i/3),
      role:i<18?'fitting':'query'});
  }
  const configFile=path.join(directory,'config.json'); await fs.writeFile(configFile,json(config));
  const bound={...config,configFile,configSha256:sha(json(config))};
  const acquisitions=[], scores=[];let fits=0;let failAt=null;let drift=false;
  const fit = json({method_content_hash:'method-fixture', configuration_sha256:bound.configSha256,
    calibration:{state:available?'candidate_calibration_available':'unavailable'}});
  const dependencies = {
    sources:async()=>sources,
    acquire:async args=>{
      const slot=config.cases.find(s=>s.plan===args[1]);
      if(acquisitions.length===failAt)throw Error('native fixture failed');
      if(slot.role==='query')assert.equal(await fs.readFile(path.join(directory,'training-fit.json'),'utf8'),fit);
      acquisitions.push(slot.id); await fs.mkdir(slot.output);
    },
    command:args=>{
      const mode=args[2];
      if(args[1]==='fixture-verify') {
        const slot=config.cases.find(s=>s.output===args[2]);
        return json({acquisition_id:slot.id, source_manifest:sourceManifestHash,sdk_cli_equal_phases:3});
      }
      if(mode==='inspect')return json({state:'engineering_pipeline_declarations_valid',method_content_hash:'method-fixture'});
      if(mode==='fit') {
        fits++;
        assert.equal(acquisitions.length,fits===1?18:36);
        return drift&&fits===2?fit+' ':fit;
      }
      if(mode==='project')return json({state:'candidate_combined_response_available',coordinates:9,method_content_hash:'method-fixture'});
      if(mode==='score') {
        assert.deepEqual(args.slice(3).filter((_,i)=>i%2===0),['--training','--case','--block','--session']);
        scores.push(args);
        return json({state:available?'candidate_condition_prediction':'abstain',
          predicted_condition:available?'arbitrary-does-not-have-to-be-correct':null,
          reason_codes:available?[]:['calibration_unavailable'], exact_integer:9007199254740991});
      }
      throw Error('unexpected command');
    },
  };
  return {config:bound,dependencies,acquisitions,scores, getFits:()=>fits,
    failAt:index=>{failAt=index;},drift:()=>{drift=true;}};
}

for(const available of [true,false])test(`full pipeline qualifies with calibration available=${available}, independent of accuracy`,async t=>{
  const f=await fixture(t,available);
  const result=await runPipelineQualification(f.config,f.dependencies);
  assert.equal(result.state,'engineering_pipeline_qualified');
  assert.equal(f.acquisitions.length,36);assert.equal(f.scores.length,36);assert.equal(f.getFits(),2);
  assert.equal(result.classification_accuracy_gate,false);assert.equal(result.study_admission,false);
  assert.equal(result.sdk_cli_equal_phases,108);
  const firstQuery=f.config.cases[18];
  const bytes=await fs.readFile(path.join(firstQuery.output,'prediction.json'),'utf8');
  assert.ok(bytes.includes('9007199254740991'));
});

test('native failure closes suffix without a fitting or query retry',async t=>{
  const f=await fixture(t);f.failAt(4);
  await assert.rejects(runPipelineQualification(f.config,f.dependencies),/native fixture failed/);
  assert.equal(f.acquisitions.length,4);assert.equal(f.getFits(),0);assert.equal(f.scores.length,0);
  const result=JSON.parse(await fs.readFile(path.join(f.config.directory,'result.json')));
  assert.equal(result.unstarted_acquisition_ids.length,31);
});

test('changed fitting replay cannot claim qualification',async t=>{
  const f=await fixture(t);f.drift();
  await assert.rejects(runPipelineQualification(f.config,f.dependencies),/replay/);
  await assert.rejects(fs.stat(path.join(f.config.directory,'qualification-result.json')),{code:'ENOENT'});
});

test('wrong cap or changed stored declarations cannot acquire',async t=>{
  const f=await fixture(t);f.config.maximumAcquisitions=35;
  await assert.rejects(runPipelineQualification(f.config,f.dependencies));assert.equal(f.acquisitions.length,0);
  f.config.maximumAcquisitions=36;f.config.sessionId='foreign-session';
  await assert.rejects(runPipelineQualification(f.config,f.dependencies));assert.equal(f.acquisitions.length,0);
});

test('unavailable measurements are pipeline failures rather than silently accepted abstentions',async t=>{
  const f=await fixture(t);const command=f.dependencies.command;
  f.dependencies.command=args=>args[2]==='project'?json({state:'unavailable',coordinates:0}):command(args);
  await assert.rejects(runPipelineQualification(f.config,f.dependencies));
  assert.equal(f.acquisitions.length,1);assert.equal(f.getFits(),0);
  const result=JSON.parse(await fs.readFile(path.join(f.config.directory,'result.json')));
  assert.equal(result.failed_stage,'verify');assert.equal(result.rows.length,0);
});

test('fitting execution failure leaves all query acquisitions unstarted',async t=>{
  const f=await fixture(t);const command=f.dependencies.command;
  f.dependencies.command=args=>{if(args[2]==='fit')throw Error('fitting execution failed');return command(args);};
  await assert.rejects(runPipelineQualification(f.config,f.dependencies),/fitting execution failed/);
  assert.equal(f.acquisitions.length,18);assert.equal(f.scores.length,0);
  const result=JSON.parse(await fs.readFile(path.join(f.config.directory,'result.json')));
  assert.equal(result.failed_stage,'before_acquire');assert.equal(result.failed_acquisition_id,null);
  assert.equal(result.unstarted_acquisition_ids.length,18);
});
