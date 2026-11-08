/** Bounded acquisition-only engineering checks in one Node process, like the study runner. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {acquireResourceConditionPlan} from './resourceConditionObservation.mjs';
import {sourceReceipt} from './rawObservation.mjs';

const tool = fileURLToPath(import.meta.url);
const json = value => JSON.stringify(value, null, 2) + '\n';
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const write = (file, value) => fs.writeFile(file, json(value), {flag:'wx', mode:0o600});
const hash = async file => sha(await fs.readFile(file));

export async function runConditionEngineering(config, dependencies = {}) {
  assert.equal(config.scope, 'engineering_only_no_study_admission');
  assert.equal(config.retryAllowed, false);
  assert.ok(Number.isSafeInteger(config.maximumAcquisitions));
  assert.ok(config.maximumAcquisitions >= 1 && config.maximumAcquisitions <= 36);
  assert.ok(Array.isArray(config.cases) && config.cases.length === config.maximumAcquisitions);
  assert.ok(path.isAbsolute(config.directory) && path.isAbsolute(config.coreDirectory));
  const directory = path.resolve(config.directory);
  const sources = dependencies.sources || sourceReceipt;
  const acquire = dependencies.acquire || acquireResourceConditionPlan;
  const verify = dependencies.verify || (slot => execFileSync(
    config.verificationCommand[0], [...config.verificationCommand.slice(1), slot.output],
    {cwd:config.coreDirectory, encoding:'utf8', timeout:90000, maxBuffer:1024*1024},
  ));
  assert.ok(Array.isArray(config.verificationCommand) && config.verificationCommand.length);
  assert.ok(path.isAbsolute(config.verificationCommand[0]));
  assert.equal(config.dependencyFiles[tool], await hash(tool), 'pinned engineering runner required');
  assert.ok(Object.keys(config.dependencyFiles).length);
  async function preflight() {
    assert.equal(sha(json(await sources())), config.sourceManifestHash);
    for (const [file, digest] of Object.entries(config.dependencyFiles)) {
      assert.ok(path.isAbsolute(file));
      assert.equal(await hash(file), digest, 'changed engineering dependency');
    }
  }
  await preflight();
  const ids = new Set();
  for (const [index, slot] of config.cases.entries()) {
    assert.match(slot.id, /^n11-raw-eng-[a-z0-9-]{1,36}$/);
    assert.ok(!ids.has(slot.id)); ids.add(slot.id);
    assert.equal(slot.output, path.join(directory, 'cases', String(index + 1)));
    assert.ok(path.isAbsolute(slot.plan));
    assert.equal(await hash(slot.plan), slot.planSha256);
    const plan = JSON.parse(await fs.readFile(slot.plan, 'utf8'));
    assert.equal(plan.acquisition_id, slot.id);
    assert.equal(plan.schema_version, 'n11-contained-resource-condition-plan-v1');
    assert.equal(plan.source_manifest_hash, config.sourceManifestHash);
    assert.equal(plan.condition.name, slot.condition);
    await assert.rejects(fs.lstat(slot.output), {code:'ENOENT'});
    await assert.rejects(fs.lstat(path.join(path.dirname(slot.plan), slot.id + '.attempt.json')), {code:'ENOENT'});
  }
  await write(path.join(directory, 'run-start.json'), {
    method:'n11-single-node-condition-engineering-v1', node_process_id:process.pid,
    started_at_utc:new Date().toISOString(), maximum_acquisitions:config.maximumAcquisitions,
    source_manifest_hash:config.sourceManifestHash, all_case_ids_excluded_from_study:[...ids],
    process_lifetime:'one_node_process_for_all_acquisitions_and_synchronous_verification',
    retry_allowed:false, empirical_acceptance:false,
  });
  const rows = []; let active = null; let attempted = false; let stage = null;
  try {
    for (const slot of config.cases) {
      active = slot; attempted = false; stage = 'preflight';
      await preflight();
      assert.equal(await hash(slot.plan), slot.planSha256);
      stage = 'acquire'; attempted = true;
      await acquire(['--plan', slot.plan, '--output-directory', slot.output]);
      await preflight(); stage = 'verify';
      const bytes = await verify(slot);
      const receipt = JSON.parse(bytes);
      assert.equal(receipt.acquisition_id, slot.id);
      assert.equal(receipt.source_manifest, config.sourceManifestHash);
      assert.equal(receipt.sdk_cli_equal_phases, 3);
      await fs.writeFile(path.join(slot.output, 'engineering-verification.stdout'), bytes, {flag:'wx', mode:0o600});
      rows.push({acquisition_id:slot.id, condition:slot.condition, state:'source_engineering_verified',
        sdk_cli_equal_phases:3, node_process_id:process.pid, node_memory_after_case:process.memoryUsage()});
      console.log(json({completed_acquisitions:rows.length, acquisition_id:slot.id}));
    }
  } catch (error) {
    await write(path.join(directory, 'result.json'), {
      state:'failed_stop', rows, failed_acquisition_id:attempted ? active.id : null,
      failed_stage:stage, reason:String(error.message).split('\n')[0].slice(0,512),
      unstarted_acquisition_ids:config.cases.slice(rows.length + (attempted ? 1 : 0)).map(s => s.id),
      node_process_id:process.pid, retry_allowed:false, empirical_acceptance:false,
      accepted_diagnostic_groups:0, ended_at_utc:new Date().toISOString(),
    });
    throw error;
  }
  const result = {state:'source_engineering_verified', rows, unstarted_acquisition_ids:[],
    node_process_id:process.pid, retry_allowed:false, empirical_acceptance:false,
    accepted_diagnostic_groups:0, ended_at_utc:new Date().toISOString()};
  await write(path.join(directory, 'result.json'), result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === tool) {
  try {
    assert.equal(process.argv.length, 4);
    const bytes = await fs.readFile(process.argv[2]);
    assert.equal(sha(bytes), process.argv[3], 'changed engineering configuration');
    await runConditionEngineering(JSON.parse(bytes));
  } catch (error) { console.error(String(error.message)); process.exitCode = 1; }
}
