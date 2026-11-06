import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture} from './resourceReceiptFixture.mjs';
import {inspectResourceConditionAcquisition as inspect} from '../n11/resourceReceipt.mjs';
import {inspectConditionAcquisition} from '../n11/conditionReceipt.mjs';
import {resourceClockId} from '../n11/resourceProtocol.mjs';
const active=run=>run.events.filter(e=>e.kind==='n11_pair_native');
const ref=(run,phase)=>run.events.find(e=>e.kind==='n11_pacing_reference'&&e.phase===phase).samples;
for(const condition of ['no_injected_fault','owned_identity_delay','owned_cpu_pressure'])test('resource source checks all phases for '+condition,()=>{
 const run=fixture(condition),before=structuredClone(run),receipt=inspect(run,{condition});
 assert.deepEqual(run,before);assert.equal(receipt.resource_integrity,'verified_declared_internal_evidence');
 assert.equal(receipt.resource_windows.length,5);assert.equal(receipt.resource_sample_count,22);
 assert.equal(receipt.empirical_acceptance,false);assert.equal(receipt.acquisition_authority,false);assert.equal(receipt.accepted_diagnostic_groups,0);
 assert.throws(()=>inspectConditionAcquisition(run,{condition}));
});
const changes={
 context:r=>r.events.filter(e=>e.kind==='n11_resource_context')[0].context.controller_origin_ns='0',
 duplicate:r=>r.events.unshift(structuredClone(r.events[0])),
 missing:r=>delete active(r)[0].container_cpu_read,
 sequence:r=>active(r)[1].container_cpu_read.sequence++,
 quota:r=>active(r)[0].container_cpu_read.quota.quota_usec=100000,
 identity:r=>active(r)[0].container_cpu_read.source_identity['cpu.stat'].inode++,
 reset:r=>active(r)[1].container_cpu_read.counters.usage_usec=0,
 clock:r=>active(r)[0].container_cpu_read.clock_id='controller-monotonic-'+'f'.repeat(64),
 phase:r=>active(r)[0].container_cpu_read.phase='relief',
 leak:r=>active(r)[0].container_cpu_read.condition='no_injected_fault',
 bool:r=>active(r)[0].container_cpu_read.counters.usage_usec=true,
 wide:r=>active(r)[0].container_cpu_read.read_end_ns+=50e6,
 boundary:r=>active(r).at(-1).container_cpu_read.read_end_ns+=1e6,
 healthy:r=>ref(r,'healthy')[0].container_cpu_read.read_start_ns=0,
 post:r=>ref(r,'post')[0].container_cpu_read.read_start_ns=1,
 ordinary:r=>r.mode='engineering-n11-condition-no_injected_fault',
 source:r=>r.method='n11-contained-condition-witness-v1',
 contextLate:r=>r.events.push(r.events.shift()),
};
for(const [name,change] of Object.entries(changes))test('resource inspector rejects '+name,()=>{
 const run=fixture();change(run);assert.throws(()=>inspect(run,{condition:'no_injected_fault'}));
});
test('ordinary method cannot accept resource fields under old mode',()=>{
 const run=fixture();run.mode='engineering-n11-condition-no_injected_fault';run.method='n11-contained-condition-witness-v1';run.role='engineering_condition_witness_label_unavailable';
 assert.throws(()=>inspectConditionAcquisition(run,{condition:'no_injected_fault'}));
});
test('clock origin is lossless decimal data and field order is deterministic',()=>{
 assert.equal(resourceClockId({method:'n11-contained-condition-resource-candidate-v1',generation:{owner:'owner',pipeline:'pipe',peer:'peer'},controller_origin_ns:'1000'}),'controller-monotonic-9812989e220f8e39099f072549bdaab02f4c9f5e90c310231ca315de7f3acde5');
 const context=fixture().events[0].context;
 assert.equal(resourceClockId(context),resourceClockId({generation:context.generation,controller_origin_ns:context.controller_origin_ns,method:context.method}));
 assert.throws(()=>resourceClockId({...context,controller_origin_ns:1234}));
 assert.throws(()=>resourceClockId({...context,controller_origin_ns:'9223372036854775808'}));
});
