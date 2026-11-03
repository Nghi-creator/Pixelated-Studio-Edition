import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepareRawPlan,acquireRawPlan} from '../n11/rawObservation.mjs';

test('source-local plans are explicit, frozen and cannot accept label/scope substitution',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'n11-plan-unit-'));
  try {
    const oldPath=path.join(directory,'common.json'),localPath=path.join(directory,'local.json');
    const args=output=>['--image','sha256:'+'a'.repeat(64),'--acquisition-id','n11-raw-unit',
      '--core-revision','b'.repeat(40),'--output',output];
    const common=await prepareRawPlan(args(oldPath));
    const local=await prepareRawPlan(args(localPath),{sourceLocal:true});
    assert.equal(common.schema_version,'n11-contained-raw-plan-v1');
    assert.equal(common.temporal_contract,undefined);
    assert.equal(local.schema_version,'n11-contained-source-local-plan-v1');
    assert.equal(local.temporal_contract,'source_local_stable_phase_v1');
    assert.equal(local.source_manifest_hash,common.source_manifest_hash);
    assert.equal(local.observations,1);assert.equal(local.retry_allowed,false);
    const original=await fs.readFile(localPath);
    await assert.rejects(prepareRawPlan(args(localPath),{sourceLocal:true}),{code:'EEXIST'});
    assert.deepEqual(await fs.readFile(localPath),original);
    local.labels='healthy';await fs.writeFile(localPath,JSON.stringify(local,null,2)+'\n');
    const output=path.join(directory,'must-not-exist');
    await assert.rejects(acquireRawPlan(['--plan',localPath,'--output-directory',output]),/source\/plan mismatch/);
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
