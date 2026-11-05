/** Reusable frozen allocation and one-block orchestration. No session/independence inference. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareConditionPlan, acquireConditionPlan} from './conditionObservation.mjs';
import {sourceReceipt} from './rawObservation.mjs';

const json = value => JSON.stringify(value, null, 2) + '\n';
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const write = (file, value) => fs.writeFile(file, json(value), {flag: 'wx', mode: 0o600});
const tool = fileURLToPath(import.meta.url);
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const hashFile = async file => sha(await fs.readFile(file));
const alias = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
const execute = (command, cwd) => execFileSync(command[0], command.slice(1), {
  cwd, encoding: 'utf8', timeout: 120000,
});

async function checkFiles(files) {
  assert.ok(files && Object.keys(files).length, 'explicit dependency file hashes required');
  for (const [file, digest] of Object.entries(files)) {
    assert.ok(path.isAbsolute(file));
    assert.match(digest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(await hashFile(file), digest, 'changed study dependency: ' + file);
  }
}

/** Core SDK remains the sole protocol validator. Dependencies allow native-free regression tests. */
export async function allocateStudy({protocolFile, directory, coreRevision, coreDirectory,
  python, verificationCommand, dependencyFiles}, dependencies = {}) {
  const prepare = dependencies.prepare || prepareConditionPlan;
  const sources = dependencies.sources || sourceReceipt;
  const inspect = dependencies.inspect || (async file => JSON.parse(execute([
    python, '-c', 'import json,sys;from latency_fingerprinting.evaluation.fixture_protocol import inspect_fixture_protocol;print(json.dumps(inspect_fixture_protocol(json.load(open(sys.argv[1])))))', file,
  ], coreDirectory)));
  directory = path.resolve(directory); protocolFile = path.resolve(protocolFile);
  assert.match(coreRevision, /^[a-f0-9]{40}$/);
  assert.ok(Array.isArray(verificationCommand) && verificationCommand.length);
  assert.ok(verificationCommand.every(v => typeof v === 'string' && v.length));
  // The verification command receives exactly one appended argument: case directory.
  assert.ok(path.isAbsolute(verificationCommand[0]), 'absolute verification executable required');
  // Pin the executable and explicit file operands as well as the caller's dependency closure.
  dependencyFiles = {...dependencyFiles};
  for (const argument of verificationCommand) {
    if (!path.isAbsolute(argument)) continue;
    const metadata = await fs.stat(argument);
    if (!metadata.isFile()) continue;
    const digest = await hashFile(argument);
    if (Object.hasOwn(dependencyFiles, argument)) assert.equal(dependencyFiles[argument], digest);
    dependencyFiles[argument] = digest;
  }
  await checkFiles(dependencyFiles);
  const protocolBytes = await fs.readFile(protocolFile);
  const protocol = JSON.parse(protocolBytes);
  const inspection = await inspect(protocolFile);
  assert.equal(inspection.state, 'reviewed_protocol_declarations_complete');
  assert.equal(sha(json(await sources())), protocol.source_manifest_hash);
  assert.ok(protocol.blocks.every(b => alias(b.block_id)));
  await fs.mkdir(directory, {mode: 0o700}); // Exclusive root: partial allocations cannot be retried.
  await write(path.join(directory, 'protocol.json'), protocol);
  const sessions = [];
  for (const block of protocol.blocks) {
    const plans = path.join(directory, 'plans', block.block_id);
    await fs.mkdir(plans, {recursive: true, mode: 0o700});
    const slots = [];
    for (const [ordinal, condition] of block.condition_order.entries()) {
      const id = block.acquisition_ids[condition];
      assert.match(id, /^n11-raw-[a-z0-9-]{1,40}$/);
      const file = path.join(plans, id + '.json');
      const plan = await prepare(['--image', protocol.image_sha256, '--acquisition-id', id,
        '--core-revision', coreRevision, '--condition', condition, '--output', file]);
      assert.equal(plan.source_manifest_hash, protocol.source_manifest_hash);
      assert.equal(plan.condition.name, condition);
      slots.push({ordinal, condition, acquisition_id: id, plan: file,
        plan_sha256: await hashFile(file),
        output: path.join(directory, 'sessions', block.block_id, 'condition-' + ordinal)});
    }
    sessions.push({...block, slots});
  }
  await checkFiles(dependencyFiles);
  assert.equal(sha(json(await sources())), protocol.source_manifest_hash);
  const allocation = {schema_version: 'n11-study-allocation-v1',
    frozen_at_utc: new Date().toISOString(), protocol_id: protocol.protocol_id,
    protocol_file_sha256: await hashFile(path.join(directory, 'protocol.json')),
    original_protocol_file_sha256: sha(protocolBytes), source_manifest_hash: protocol.source_manifest_hash,
    tool_sha256: await hashFile(tool), core_revision: coreRevision,
    core_directory: path.resolve(coreDirectory), python, verification_command: verificationCommand,
    dependency_files: dependencyFiles, sessions, acquisition_authority: false};
  await write(path.join(directory, 'allocation.json'), allocation);
  return allocation;
}

/** Execute exactly one declared training block. Evaluation orchestration is intentionally separate. */
export async function runStudySession({directory, blockId, contextFile}, dependencies = {}) {
  directory = path.resolve(directory);
  assert.ok(alias(blockId));
  const acquire = dependencies.acquire || acquireConditionPlan;
  const sources = dependencies.sources || sourceReceipt;
  const verify = dependencies.verify || (async (command, cwd) => execute(command, cwd));
  const allocation = await read(path.join(directory, 'allocation.json'));
  assert.equal(allocation.schema_version, 'n11-study-allocation-v1');
  assert.equal(await hashFile(tool), allocation.tool_sha256);
  assert.equal(await hashFile(path.join(directory, 'protocol.json')), allocation.protocol_file_sha256);
  const protocol = await read(path.join(directory, 'protocol.json'));
  const inspect = dependencies.inspect || (async file => JSON.parse(execute([
    allocation.python, '-c', 'import json,sys;from latency_fingerprinting.evaluation.fixture_protocol import inspect_fixture_protocol;print(json.dumps(inspect_fixture_protocol(json.load(open(sys.argv[1])))))', file,
  ], allocation.core_directory)));
  assert.equal((await inspect(path.join(directory, 'protocol.json'))).state,
    'reviewed_protocol_declarations_complete');
  assert.equal(allocation.protocol_id, protocol.protocol_id);
  assert.equal(allocation.source_manifest_hash, protocol.source_manifest_hash);
  const session = allocation.sessions.find(b => b.block_id === blockId);
  assert.ok(session, 'unknown session');
  assert.equal(session.role, 'training', 'evaluation requires a separate calibrated workflow');
  assert.equal(session.slots.length, 3);
  const declared = protocol.blocks.find(b => b.block_id === blockId);
  assert.ok(declared);
  for (const key of ['role', 'host_id', 'session_id']) assert.equal(session[key], declared[key]);
  assert.deepEqual(session.slots.map(s => s.condition), declared.condition_order);
  for (const [index, slot] of session.slots.entries()) {
    assert.equal(slot.ordinal, index);
    assert.equal(slot.acquisition_id, declared.acquisition_ids[slot.condition]);
    assert.equal(slot.plan, path.join(directory, 'plans', blockId, slot.acquisition_id + '.json'));
    const plan = await read(slot.plan);
    assert.equal(plan.acquisition_id, slot.acquisition_id);
    assert.equal(plan.condition.name, slot.condition);
    assert.equal(plan.source_manifest_hash, allocation.source_manifest_hash);
  }
  const contextBytes = await fs.readFile(contextFile);
  const context = JSON.parse(contextBytes);
  assert.equal(context.block_id, blockId);
  assert.equal(context.host_id, session.host_id);
  assert.equal(context.session_id, session.session_id);
  assert.ok(typeof context.boundary_description === 'string' && context.boundary_description.trim());
  assert.ok(typeof context.documented_by === 'string' && context.documented_by.trim());
  assert.equal(typeof context.recorded_at_utc, 'string');
  assert.ok(Number.isFinite(Date.parse(context.recorded_at_utc)));
  assert.ok(Date.parse(context.recorded_at_utc) <= Date.now());
  assert.ok(Array.isArray(context.known_cross_session_correlations));
  assert.equal(context.known_cross_session_correlations.length, 0,
    'correlated sessions require protocol regrouping before collection');
  async function preflight() {
    await checkFiles(allocation.dependency_files);
    assert.equal(sha(json(await sources())), allocation.source_manifest_hash);
  }
  await preflight();
  for (const slot of session.slots) {
    assert.equal(await hashFile(slot.plan), slot.plan_sha256);
    assert.equal(slot.output, path.join(directory, 'sessions', blockId, 'condition-' + slot.ordinal));
    await assert.rejects(fs.lstat(slot.output), {code: 'ENOENT'});
    await assert.rejects(fs.lstat(path.join(path.dirname(slot.plan), slot.acquisition_id + '.attempt.json')),
      {code: 'ENOENT'});
  }
  const output = path.join(directory, 'sessions', blockId);
  await fs.mkdir(path.dirname(output), {recursive: true, mode: 0o700});
  await fs.mkdir(output, {mode: 0o700});
  await write(path.join(output, 'session-start.json'), {block_id: blockId,
    started_at_utc: new Date().toISOString(), context,
    context_sha256: sha(contextBytes), physical_independence: 'not_authenticated',
    protocol_id: allocation.protocol_id});
  const rows = [];
  try {
    for (const slot of session.slots) {
      await preflight();
      assert.equal(await hashFile(slot.plan), slot.plan_sha256);
      await acquire(['--plan', slot.plan, '--output-directory', slot.output]);
      const run = await read(path.join(slot.output, 'acquisition.json'));
      assert.equal(run.mode, 'engineering-n11-condition-' + slot.condition);
      const verification = await verify([...allocation.verification_command, slot.output], allocation.core_directory);
      await fs.writeFile(path.join(slot.output, 'verification-command.stdout'),
        verification == null ? '' : String(verification), {flag: 'wx', mode: 0o600});
      await preflight();
      rows.push({acquisition_id: slot.acquisition_id, condition: slot.condition,
        state: 'acquired_verification_command_passed'});
    }
  } catch (error) {
    await write(path.join(output, 'session-result.json'), {block_id: blockId,
      state: 'failed_stop', completed_rows: rows, failed_acquisition_id: session.slots[rows.length]?.acquisition_id,
      unstarted_acquisition_ids: session.slots.slice(rows.length + 1).map(s => s.acquisition_id),
      ended_at_utc: new Date().toISOString(), reason: String(error.message).split('\n')[0].slice(0, 512),
      retry_allowed: false});
    throw error;
  }
  const result = {block_id: blockId, state: 'complete_verification_command_passed', rows,
    ended_at_utc: new Date().toISOString(), physical_independence: 'not_authenticated',
    accepted_diagnostic_groups: 0};
  await write(path.join(output, 'session-result.json'), result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === tool) {
  try {
    const [mode, configFile] = process.argv.slice(2);
    assert.equal(process.argv.length, 4, 'usage: studySession.mjs allocate|run CONFIG.json');
    const config = await read(configFile);
    if (mode === 'allocate') console.log(json(await allocateStudy(config)));
    else if (mode === 'run') console.log(json(await runStudySession(config)));
    else throw Error('explicit allocate or run required');
  } catch (error) {
    console.error('error: study session stopped: ' + String(error.message).split('\n')[0]);
    process.exitCode = 1;
  }
}
