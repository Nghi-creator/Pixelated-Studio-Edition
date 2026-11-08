import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runConditionEngineering} from '../n11/conditionEngineering.mjs';

const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const runner = fileURLToPath(new URL('../n11/conditionEngineering.mjs', import.meta.url));
async function fixture(t, count = 3) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'n11-single-node-test-'));
  t.after(() => fs.rm(directory, {recursive:true, force:true}));
  await fs.mkdir(path.join(directory, 'cases'));
  let sources = {fixture:'a'.repeat(64)};
  const sourceManifestHash = sha(json(sources));
  const config = {directory, coreDirectory:directory, scope:'engineering_only_no_study_admission', retryAllowed:false,
    maximumAcquisitions:count, sourceManifestHash, verificationCommand:[process.execPath],
    dependencyFiles:{[runner]:sha(await fs.readFile(runner))}, cases:[]};
  for (let i = 0; i < count; i++) {
    const id = 'n11-raw-eng-test-' + i, plan = path.join(directory, id + '.json');
    const value = {acquisition_id:id, schema_version:'n11-contained-resource-condition-plan-v1',
      source_manifest_hash:sourceManifestHash, condition:{name:'owned_identity_delay'}};
    await fs.writeFile(plan, json(value));
    config.cases.push({id, condition:value.condition.name, plan, planSha256:sha(json(value)),
      output:path.join(directory, 'cases', String(i + 1))});
  }
  const calls = [];
  const dependencies = {
    sources:async () => sources,
    acquire:async args => { calls.push(args); await fs.mkdir(args[3]); },
    verify:slot => json({acquisition_id:slot.id, source_manifest:sourceManifestHash,
      sdk_cli_equal_phases:3, derived_files_created:5}),
  };
  return {config, dependencies, calls, changeSource:() => { sources = {fixture:'b'.repeat(64)}; },
    result:async () => JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8'))};
}

test('all cases acquire in one process, retain verification bytes and never fit/score', async t => {
  const f = await fixture(t);
  const result = await runConditionEngineering(f.config, f.dependencies);
  assert.equal(result.rows.length, 3);
  assert.deepEqual([...new Set(result.rows.map(r => r.node_process_id))], [process.pid]);
  assert.equal(result.empirical_acceptance, false);
  assert.equal(f.calls.length, 3);
  for (const slot of f.config.cases) {
    assert.equal(await fs.readFile(path.join(slot.output, 'engineering-verification.stdout'), 'utf8'),
      f.dependencies.verify(slot));
  }
});

test('acquisition failure stops suffix and cannot resume', async t => {
  const f = await fixture(t); let attempted = 0;
  f.dependencies.acquire = async () => { attempted++; throw Error('fixture failure'); };
  await assert.rejects(runConditionEngineering(f.config, f.dependencies), /fixture failure/);
  const result = await f.result();
  assert.equal(result.failed_acquisition_id, f.config.cases[0].id);
  assert.deepEqual(result.unstarted_acquisition_ids, f.config.cases.slice(1).map(s => s.id));
  assert.equal(result.retry_allowed, false);
  await assert.rejects(runConditionEngineering(f.config, f.dependencies), /EEXIST/);
  assert.equal(attempted, 1);
});

test('verification failure preserves attempted case and stops suffix', async t => {
  const f = await fixture(t);
  f.dependencies.verify = () => { throw Error('verification failed'); };
  await assert.rejects(runConditionEngineering(f.config, f.dependencies), /verification failed/);
  const result = await f.result();
  assert.equal(result.failed_stage, 'verify');
  assert.equal(result.rows.length, 0);
  assert.equal(f.calls.length, 1);
});

test('changed source between cases stops before next attempt', async t => {
  const f = await fixture(t); const verify = f.dependencies.verify;
  f.dependencies.verify = slot => { f.changeSource(); return verify(slot); };
  await assert.rejects(runConditionEngineering(f.config, f.dependencies));
  const result = await f.result();
  assert.equal(result.rows.length, 1);
  assert.equal(result.failed_acquisition_id, null);
  assert.equal(result.failed_stage, 'preflight');
  assert.deepEqual(result.unstarted_acquisition_ids, f.config.cases.slice(1).map(s => s.id));
  assert.equal(f.calls.length, 1);
});

test('changed plans or unpinned runner cannot acquire', async t => {
  const f = await fixture(t);
  await fs.appendFile(f.config.cases[0].plan, ' ');
  await assert.rejects(runConditionEngineering(f.config, f.dependencies));
  assert.equal(f.calls.length, 0);
  delete f.config.dependencyFiles[runner];
  await assert.rejects(runConditionEngineering(f.config, f.dependencies), /pinned engineering runner/);
});

test('study IDs, output escapes and retry requests are rejected', async t => {
  for (const change of [
    f => { f.config.retryAllowed = true; },
    f => { f.config.cases[0].id = 'n11-raw-cs-query-001'; },
    f => { f.config.cases[0].output = '/tmp/foreign-engineering-case'; },
    f => { f.config.maximumAcquisitions = 37; },
  ]) {
    const f = await fixture(t); change(f);
    await assert.rejects(runConditionEngineering(f.config, f.dependencies));
    assert.equal(f.calls.length, 0);
  }
});
