/** Synthetic I/O wiring; no native acquisition. */
import assert from 'node:assert/strict';import {test} from 'node:test';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {prepareResourceConditionPlan,acquireResourceConditionPlan} from '../n11/resourceConditionObservation.mjs';
import {prepareConditionPlan,acquireConditionPlan} from '../n11/conditionObservation.mjs';
import {fixture} from './resourceReceiptFixture.mjs';
const sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
async function setup(t,id='n11-raw-resource-unit-001'){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'resource-route-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const plan=path.join(directory,'plan.json'),output=path.join(directory,'case');
 await prepareResourceConditionPlan(['--image','sha256:'+'a'.repeat(64),'--acquisition-id',id,'--core-revision','b'.repeat(40),'--condition','no_injected_fault','--output',plan]);
 return {directory,plan,output,args:['--plan',plan,'--output-directory',output]};
}
test('resource plan has explicit method/mode while ordinary defaults stay original',async t=>{
 const f=await setup(t),plan=JSON.parse(await fs.readFile(f.plan));
 assert.equal(plan.schema_version,'n11-contained-resource-condition-plan-v1');assert.equal(plan.mode,'engineering-n11-resource-condition-no_injected_fault');assert.equal(plan.resources.maximum_read_span_ns,50e6);assert.equal(plan.retry_allowed,false);
 const old=path.join(f.directory,'ordinary.json');await prepareConditionPlan(['--image',plan.image,'--acquisition-id','n11-raw-ordinary-unit-001','--core-revision',plan.core_revision,'--condition','no_injected_fault','--output',old]);
 const ordinary=JSON.parse(await fs.readFile(old));assert.equal(ordinary.schema_version,'n11-contained-condition-plan-v1');assert.equal(ordinary.mode,'engineering-n11-condition-no_injected_fault');assert.equal(Object.hasOwn(ordinary,'resources'),false);
});
test('synthetic resource route exports raw, inspected resources and delegated paired phases',async t=>{
 const f=await setup(t),raw=fixture();let calls=0,exports=0;
 await acquireResourceConditionPlan(f.args,{acquire:async(image,mode,options)=>{calls++;assert.equal(mode,'engineering-n11-resource-condition-no_injected_fault');assert.equal(options.comparisonCaseId,'n11-raw-resource-unit-001');return raw;},exportPhases:async(directory,run,plan)=>{exports++;assert.equal(directory,f.output);assert.equal(run,raw);assert.equal(plan.resources.quota_usec,200000);}});
 assert.equal(calls,1);assert.equal(exports,1);
 const bytes=await fs.readFile(path.join(f.output,'acquisition.json')),resource=JSON.parse(await fs.readFile(path.join(f.output,'resource-observation.json')));
 assert.equal(resource.source_payload_sha256,sha(bytes));assert.equal(resource.windows.length,5);assert.equal(resource.samples.healthy.length,5);assert.equal(resource.empirical_acceptance,false);
 assert.equal(JSON.parse(await fs.readFile(path.join(f.output,'control-receipt.json'))).resource_integrity,'verified_declared_internal_evidence');
 await assert.rejects(acquireResourceConditionPlan(f.args,{acquire:async()=>{calls++;return raw;}}));assert.equal(calls,1);
});
test('bad resource samples retain raw failed attempt and cannot be retried',async t=>{
 const f=await setup(t),raw=fixture();delete raw.events.find(e=>e.kind==='n11_pair_native').container_cpu_read;let calls=0,exports=0;
 const dependencies={acquire:async()=>{calls++;return raw;},exportPhases:async()=>{exports++;}};
 await assert.rejects(acquireResourceConditionPlan(f.args,dependencies));assert.equal(calls,1);assert.equal(exports,0);
 assert.ok(await fs.readFile(path.join(f.output,'acquisition.json')));assert.ok(await fs.readFile(path.join(f.output,'failure.json')));
 await assert.rejects(acquireResourceConditionPlan(f.args,dependencies));assert.equal(calls,1);
});
test('ordinary acquire and changed pinned plan reject before fake launch',async t=>{
 const f=await setup(t);let calls=0;const dependencies={acquire:async()=>{calls++;return fixture();}};
 await assert.rejects(acquireConditionPlan(f.args,dependencies));assert.equal(calls,0);
 const plan=JSON.parse(await fs.readFile(f.plan));plan.resources.maximum_samples=129;await fs.writeFile(f.plan,JSON.stringify(plan,null,2)+'\n');
 await assert.rejects(acquireResourceConditionPlan(f.args,dependencies));assert.equal(calls,0);
});
