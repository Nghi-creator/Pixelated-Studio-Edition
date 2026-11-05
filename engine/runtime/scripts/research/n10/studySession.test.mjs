/** Artificial dependency-injected sessions. These tests never start Docker or native capture. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {allocateStudy, runStudySession} from '../n11/studySession.mjs';

const json = value => JSON.stringify(value, null, 2) + '\n';
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const conditions = ['no_injected_fault', 'owned_identity_delay', 'owned_cpu_pressure'];

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'n11-study-tool-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const source = path.join(root, 'source.py');
  await fs.writeFile(source, 'frozen source');
  const sources = async () => ({'source.py': 'a'.repeat(64)});
  const protocol = {protocol_id: 'artificial-protocol', source_manifest_hash: sha(json(await sources())),
    image_sha256: 'sha256:' + 'b'.repeat(64), blocks: [
      ...['training', 'evaluation'].map((role, i) => ({block_id: 'block-' + i,
        role, host_id: 'host', session_id: 'session-' + i, condition_order: conditions,
        acquisition_ids: Object.fromEntries(conditions.map((c, n) => [c, `n11-raw-test-${i}-${n}`]))})),
    ]};
  const protocolFile = path.join(root, 'protocol.json');
  await fs.writeFile(protocolFile, json(protocol));
  const inspect = async () => ({state: 'reviewed_protocol_declarations_complete'});
  const prepare = async args => {
    const o = Object.fromEntries(Array.from({length: args.length / 2}, (_, i) => args.slice(i * 2, i * 2 + 2)));
    const plan = {acquisition_id: o['--acquisition-id'], source_manifest_hash: protocol.source_manifest_hash,
      condition: {name: o['--condition']}};
    await fs.writeFile(o['--output'], json(plan), {flag: 'wx'});
    return plan;
  };
  const directory = path.join(root, 'study');
  const config = {protocolFile, directory, coreRevision: 'c'.repeat(40), coreDirectory: root,
    python: '/unused/python', verificationCommand: [process.execPath, source],
    dependencyFiles: {[source]: sha('frozen source')}};
  const deps = {sources, prepare, inspect};
  const allocation = await allocateStudy(config, deps);
  const contextFile = path.join(root, 'context.json');
  const context = {block_id: 'block-0', host_id: 'host', session_id: 'session-0',
    boundary_description: 'artificial boundary for regression only', documented_by: 'test',
    recorded_at_utc: new Date().toISOString(), known_cross_session_correlations: []};
  await fs.writeFile(contextFile, json(context));
  const calls = [], verified = [];
  const acquire = async args => {
    const plan = JSON.parse(await fs.readFile(args[1]));
    calls.push(plan.acquisition_id);
    await fs.mkdir(args[3]);
    await fs.writeFile(path.join(args[3], 'acquisition.json'), json({mode: 'engineering-n11-condition-' + plan.condition.name}));
  };
  const verify = async command => verified.push(command.at(-1));
  return {root, source, config, deps, allocation, contextFile, context, directory, calls, verified,
    runConfig: {directory, blockId: 'block-0', contextFile},
    runDeps: {sources, inspect, acquire, verify}};
}

test('allocation is exclusive, freezes all slots and runs exactly one three-arm block', async t => {
  const f = await fixture(t);
  assert.equal(f.allocation.sessions.length, 2);
  await assert.rejects(allocateStudy(f.config, f.deps), {code: 'EEXIST'});
  const result = await runStudySession(f.runConfig, f.runDeps);
  assert.equal(result.state, 'complete_verification_command_passed');
  assert.equal(f.calls.length, 3);
  assert.equal(f.verified.length, 3);
  assert.deepEqual(result.rows.map(r => r.condition), conditions);
  assert.equal(result.physical_independence, 'not_authenticated');
  await assert.rejects(fs.stat(path.join(f.directory, 'sessions/block-1')), {code: 'ENOENT'});
  await assert.rejects(runStudySession(f.runConfig, f.runDeps));
  assert.equal(f.calls.length, 3);
});

test('a failure retains the stopped suffix and cannot retry the block', async t => {
  const f = await fixture(t);
  f.runDeps.verify = async () => {throw Error('export mismatch');};
  await assert.rejects(runStudySession(f.runConfig, f.runDeps), /export mismatch/);
  const result = JSON.parse(await fs.readFile(path.join(f.directory, 'sessions/block-0/session-result.json')));
  assert.equal(result.state, 'failed_stop');
  assert.equal(result.retry_allowed, false);
  assert.equal(result.unstarted_acquisition_ids.length, 2);
  assert.equal(f.calls.length, 1);
  await assert.rejects(runStudySession(f.runConfig, f.runDeps));
  assert.equal(f.calls.length, 1);
});

for (const mutation of ['dependency', 'plan', 'context', 'correlation', 'protocol', 'order', 'evaluation']) {
  test(`rejects ${mutation} before acquisition`, async t => {
    const f = await fixture(t);
    if (mutation === 'dependency') await fs.writeFile(f.source, 'changed');
    if (mutation === 'plan') await fs.appendFile(f.allocation.sessions[0].slots[0].plan, '\n');
    if (mutation === 'context') {
      delete f.context.boundary_description;
      await fs.writeFile(f.contextFile, json(f.context));
    }
    if (mutation === 'correlation') {
      f.context.known_cross_session_correlations = ['block-other'];
      await fs.writeFile(f.contextFile, json(f.context));
    }
    if (mutation === 'protocol') f.runDeps.inspect = async () => ({state: 'unavailable'});
    if (mutation === 'order') {
      f.allocation.sessions[0].slots.reverse();
      await fs.writeFile(path.join(f.directory, 'allocation.json'), json(f.allocation));
    }
    if (mutation === 'evaluation') f.runConfig.blockId = 'block-1';
    await assert.rejects(runStudySession(f.runConfig, f.runDeps));
    assert.equal(f.calls.length, 0);
  });
}

test('source drift after verification stops subsequent conditions', async t => {
  const f = await fixture(t);
  f.runDeps.verify = async () => {await fs.writeFile(f.source, 'changed after acquisition');};
  await assert.rejects(runStudySession(f.runConfig, f.runDeps), /changed study dependency/);
  assert.equal(f.calls.length, 1);
});
