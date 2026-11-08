/** Engineering-only full path: freeze fitting before queries; accuracy is never a pass gate. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runConditionEngineering} from './conditionEngineering.mjs';
import {sourceReceipt} from './rawObservation.mjs';

const tool = fileURLToPath(import.meta.url);
const json = value => JSON.stringify(value, null, 2) + '\n';
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const hash = async file => sha(await fs.readFile(file));
const write = (file, bytes) => fs.writeFile(file, bytes, {flag:'wx', mode:0o600});
const invoke = (args, cwd) => execFileSync(args[0], args.slice(1), {
  cwd, encoding:'utf8', timeout:120000, maxBuffer:64*1024*1024,
});

export async function runPipelineQualification(config, dependencies = {}) {
  assert.equal(config.pipelineQualification, 'n11-engineering-pipeline-qualification-v1');
  assert.equal(config.maximumAcquisitions, 36);
  assert.equal(config.dependencyFiles[tool], await hash(tool));
  for (const key of ['python', 'processor', 'configFile']) assert.ok(path.isAbsolute(config[key]));
  assert.equal(config.dependencyFiles[config.processor], await hash(config.processor));
  assert.equal(await hash(config.configFile), config.configSha256);
  const bound = JSON.parse(await fs.readFile(config.configFile, 'utf8'));
  // CLI-only binding fields are not embedded in their own file hash.
  const {configFile, configSha256, ...stored} = config;
  assert.deepEqual(stored, bound);
  const command = dependencies.command || invoke;
  const call = (...args) => command([config.python, config.processor, ...args], config.coreDirectory);
  const inspection = JSON.parse(call('inspect', configFile));
  assert.equal(inspection.state, 'engineering_pipeline_declarations_valid');
  let fitted = null; let freeze = null;
  const fitFile = path.join(config.directory, 'training-fit.json');
  const predictions = [];
  const result = await runConditionEngineering(config, {
    ...dependencies,
    beforeAcquire: async slot => {
      assert.equal(await hash(configFile), configSha256);
      if (slot.role === 'query' && fitted === null) {
        const bytes = call('fit', configFile);
        fitted = JSON.parse(bytes);
        assert.equal(fitted.method_content_hash, inspection.method_content_hash);
        assert.equal(fitted.configuration_sha256, configSha256);
        assert.ok(['unavailable', 'candidate_calibration_available'].includes(fitted.calibration.state));
        await write(fitFile, bytes);
        freeze = sha(bytes);
        await write(path.join(config.directory, 'training-freeze.json'), json({
          sha256:freeze, query_acquisitions_started:0, scope:'engineering_only',
          calibration_state:fitted.calibration.state,
        }));
      }
      if (slot.role === 'query') assert.equal(await hash(fitFile), freeze);
    },
    verify: async slot => {
      assert.equal(await hash(configFile), configSha256);
      const receipt = JSON.parse(command([...config.verificationCommand, slot.output], config.coreDirectory));
      const point = JSON.parse(call('project', slot.output));
      assert.equal(point.state, 'candidate_combined_response_available');
      assert.equal(point.coordinates, 9);
      assert.equal(point.method_content_hash, inspection.method_content_hash);
      if (slot.role === 'query') {
        assert.equal(await hash(fitFile), freeze);
        // The scorer receives no query plan, receipt, condition or expected class.
        const bytes = call('score', '--training', fitFile, '--case', slot.output,
          '--block', slot.block_id, '--session', config.sessionId);
        const score = JSON.parse(bytes);
        assert.ok(['abstain', 'candidate_condition_prediction'].includes(score.state));
        if (fitted.calibration.state === 'unavailable') {
          assert.equal(score.state, 'abstain');
          assert.ok(score.reason_codes.includes('calibration_unavailable'));
        }
        await write(path.join(slot.output, 'prediction.json'), bytes);
        predictions.push({acquisition_id:slot.id, state:score.state, artifact_sha256:sha(bytes)});
      }
      return json({...receipt, pipeline_projection:point});
    },
  });
  assert.equal(result.rows.length, 36);
  assert.equal(predictions.length, 18);
  assert.equal(await hash(fitFile), freeze);
  assert.equal(sha(call('fit', configFile)), freeze, 'fitting replay must reproduce exact bytes');
  for (const slot of config.cases.filter(s => s.role === 'query')) {
    assert.equal(sha(call('score', '--training', fitFile, '--case', slot.output,
      '--block', slot.block_id, '--session', config.sessionId)),
    await hash(path.join(slot.output, 'prediction.json')), 'prediction replay must reproduce exact bytes');
  }
  assert.equal(await hash(configFile), configSha256);
  assert.equal(sha(json(await (dependencies.sources || sourceReceipt)())), config.sourceManifestHash);
  for (const [file, digest] of Object.entries(config.dependencyFiles)) assert.equal(await hash(file), digest);
  const qualification = {
    state:'engineering_pipeline_qualified', acquisitions:36, sdk_cli_equal_phases:108,
    fitting_frozen_before_queries:true, fitting_replayed_byte_identically:true,
    predictions_replayed_byte_identically:true,
    calibration_state:fitted.calibration.state, prediction_artifacts:predictions,
    classification_accuracy_gate:false, study_admission:false,
    session_components:1, independent_support_groups:0, empirical_acceptance:false,
    source_manifest_hash:config.sourceManifestHash, method_content_hash:inspection.method_content_hash,
    retry_allowed:false, ended_at_utc:new Date().toISOString(),
  };
  await write(path.join(config.directory, 'qualification-result.json'), json(qualification));
  return qualification;
}

if (process.argv[1] && path.resolve(process.argv[1]) === tool) {
  try {
    assert.equal(process.argv.length, 4);
    const bytes = await fs.readFile(process.argv[2]);
    assert.equal(sha(bytes), process.argv[3]);
    await runPipelineQualification({...JSON.parse(bytes),
      configFile:path.resolve(process.argv[2]), configSha256:sha(bytes)});
  } catch (error) { console.error(String(error.message)); process.exitCode = 1; }
}
