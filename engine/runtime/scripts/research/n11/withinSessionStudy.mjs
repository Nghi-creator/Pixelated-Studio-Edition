/** One explicitly correlated host session; all arms/roles frozen before data, no retries. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {allocateStudy} from './studySession.mjs';
import {acquireConditionPlan} from './conditionObservation.mjs';
import {sourceReceipt} from './rawObservation.mjs';

const json = v => JSON.stringify(v, null, 2) + '\n';
const sha = b => 'sha256:' + createHash('sha256').update(b).digest('hex');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const write = (file, value) => fs.writeFile(file, json(value), {flag:'wx',mode:0o600});
const hash = async file => sha(await fs.readFile(file));
const tool = fileURLToPath(import.meta.url);
function command(args, cwd) {
  return execFileSync(args[0], args.slice(1), {cwd,encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024});
}

export async function allocateWithinSession(config) {
  assert.ok(path.isAbsolute(config.processor));
  assert.equal(config.dependencyFiles[config.processor], await hash(config.processor));
  const inspect = async file => {
    const result=JSON.parse(command([config.python,config.processor,'inspect',file],config.coreDirectory));
    assert.equal(result.state,'reviewed_within_session_declarations_complete');
    // Reuse allocation mechanics, never the separate-session validator or its authority.
    return {state:'reviewed_protocol_declarations_complete'};
  };
  const allocation=await allocateStudy(config,{inspect});
  await write(path.join(config.directory,'within-session-runner.json'),{
    method_release:'n11-within-session-protocol-v1',
    allocation_sha256:await hash(path.join(config.directory,'allocation.json')),
    tool_sha256:await hash(tool),processor:config.processor,python:config.python,
    session_components:1,independent_support_groups:0,
  });
  return allocation;
}

export async function runWithinSession({directory,contextFile}, dependencies={}) {
  directory=path.resolve(directory);
  const acquire=dependencies.acquire || acquireConditionPlan;
  const sources=dependencies.sources || sourceReceipt;
  const invoke=dependencies.command || command;
  const allocation=await read(path.join(directory,'allocation.json'));
  const runner=await read(path.join(directory,'within-session-runner.json'));
  assert.equal(runner.method_release,'n11-within-session-protocol-v1');
  assert.equal(await hash(tool),runner.tool_sha256);
  assert.equal(await hash(path.join(directory,'allocation.json')),runner.allocation_sha256);
  assert.equal(await hash(path.join(directory,'protocol.json')),allocation.protocol_file_sha256);
  const protocol=await read(path.join(directory,'protocol.json'));
  const inspection=JSON.parse(invoke([runner.python,runner.processor,'inspect',path.join(directory,'protocol.json')],allocation.core_directory));
  assert.equal(inspection.state,'reviewed_within_session_declarations_complete');
  const contextBytes=await fs.readFile(contextFile),context=JSON.parse(contextBytes);
  assert.equal(context.session_id,protocol.blocks[0].session_id);
  assert.equal(context.host_id,protocol.blocks[0].host_id);
  assert.equal(context.session_components,1);
  assert.equal(context.independent_support_groups,0);
  assert.ok(typeof context.documented_by==='string'&&context.documented_by.trim());
  assert.ok(typeof context.observed_context==='object'&&context.observed_context!==null);
  const slots=allocation.sessions.flatMap(b=>b.slots.map(s=>({...s,block_id:b.block_id,role:b.role})));
  assert.equal(slots.length,36);
  async function preflight() {
    assert.equal(await hash(path.join(directory,'allocation.json')),runner.allocation_sha256);
    assert.equal(await hash(path.join(directory,'protocol.json')),allocation.protocol_file_sha256);
    assert.equal(sha(json(await sources())),allocation.source_manifest_hash);
    for(const [file,digest] of Object.entries(allocation.dependency_files))assert.equal(await hash(file),digest);
  }
  await preflight();
  for(const [i,block] of allocation.sessions.entries()) {
    const declared=protocol.blocks[i];
    for(const key of ['block_id','role','host_id','session_id'])assert.equal(block[key],declared[key]);
    assert.deepEqual(block.slots.map(s=>s.condition),declared.condition_order);
    for(const [ordinal,slot] of block.slots.entries()) {
      assert.equal(slot.acquisition_id,declared.acquisition_ids[slot.condition]);
      assert.equal(slot.ordinal,ordinal);
      assert.equal(slot.output,path.join(directory,'sessions',block.block_id,'condition-'+ordinal));
      assert.equal(await hash(slot.plan),slot.plan_sha256);
      await assert.rejects(fs.lstat(slot.output),{code:'ENOENT'});
      await assert.rejects(fs.lstat(path.join(path.dirname(slot.plan),slot.acquisition_id+'.attempt.json')),{code:'ENOENT'});
    }
  }
  await write(path.join(directory,'session-start.json'),{started_at_utc:new Date().toISOString(),
    context,context_sha256:sha(contextBytes),protocol_id:protocol.protocol_id,session_components:1,
    independent_support_groups:0,physical_independence:'not_estimated_same_session_only'});
  const rows=[];let fitted=null;let stopped=null;let active=null;
  try {
    for(const slot of slots) {
      active=slot;
      if(slot.role==='evaluation'&&fitted===null) {
        await preflight();
        const fittedBytes=invoke([runner.python,runner.processor,'fit',path.join(directory,'allocation.json')],allocation.core_directory);
        fitted=JSON.parse(fittedBytes);
        // Python identities distinguish JSON 6.0 from 6 in opaque embedded records.
        // Inspect the response, but persist its original bytes without JS reserialization.
        await fs.writeFile(path.join(directory,'training-fit.json'),fittedBytes,{flag:'wx',mode:0o600});
        await write(path.join(directory,'training-freeze.json'),{sha256:await hash(path.join(directory,'training-fit.json')),frozen_at_utc:new Date().toISOString(),evaluation_acquisitions_started:0});
        if(fitted.calibration.state!=='experimental_calibration_available') {
          stopped='calibration_unavailable_evaluation_unstarted';break;
        }
      }
      await preflight();
      assert.equal(await hash(slot.plan),slot.plan_sha256);
      await fs.mkdir(path.dirname(slot.output),{recursive:true,mode:0o700});
      await acquire(['--plan',slot.plan,'--output-directory',slot.output]);
      const verification=invoke([...allocation.verification_command,slot.output],allocation.core_directory);
      await fs.writeFile(path.join(slot.output,'verification-command.stdout'),verification,{flag:'wx',mode:0o600});
      let prediction=null;
      if(slot.role==='evaluation') {
        const freeze=await read(path.join(directory,'training-freeze.json'));
        assert.equal(await hash(path.join(directory,'training-fit.json')),freeze.sha256);
        const predictionBytes=invoke([runner.python,runner.processor,'score','--training',path.join(directory,'training-fit.json'),
          '--response',path.join(slot.output,'response.json'),'--block',slot.block_id,'--session',context.session_id],allocation.core_directory);
        prediction=JSON.parse(predictionBytes);
        await fs.writeFile(path.join(slot.output,'prediction.json'),predictionBytes,{flag:'wx',mode:0o600});
      }
      await preflight();
      rows.push({block_id:slot.block_id,role:slot.role,condition:slot.condition,
        acquisition_id:slot.acquisition_id,state:'complete_verified',prediction});
      console.log(json({completed_acquisitions:rows.length,block_id:slot.block_id,condition:slot.condition}));
    }
  } catch(error) {
    await write(path.join(directory,'session-result.json'),{state:'failed_stop',rows,
      failed_acquisition_id:active?.acquisition_id,ended_at_utc:new Date().toISOString(),
      reason:String(error.message).split('\n')[0].slice(0,512),retry_allowed:false,
      unstarted_acquisition_ids:slots.slice(rows.length+1).map(s=>s.acquisition_id),session_components:1});
    throw error;
  }
  const result={state:stopped || 'complete_within_session_evaluation',rows,
    ended_at_utc:new Date().toISOString(),session_components:1,independent_support_groups:0,
    unstarted_acquisition_ids:slots.slice(rows.length).map(s=>s.acquisition_id),
    calibration_state:fitted?.calibration.state,calibration_reasons:fitted?.calibration.reason_codes,
    independent_performance:'not_estimated_same_session_only',empirical_acceptance:false,
    accepted_diagnostic_groups:0,diagnostic_label:null,retry_allowed:false};
  await write(path.join(directory,'session-result.json'),result);
  return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===tool) {
  try {
    assert.equal(process.argv.length,4);
    const config=await read(process.argv[3]);
    if(process.argv[2]==='allocate')await allocateWithinSession(config);
    else if(process.argv[2]==='run')await runWithinSession(config);
    else throw Error('explicit allocate/run required');
  } catch(error) {console.error(String(error.message));process.exitCode=1;}
}
