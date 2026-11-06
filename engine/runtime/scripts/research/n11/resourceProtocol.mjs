/** Closed auxiliary resource protocol; ownership and measurements remain separate. */
import {createHash} from 'node:crypto';
import {CONDITIONS} from './conditionProtocol.mjs';
export const RESOURCE_METHOD='n11-contained-condition-resource-candidate-v1';
export const RESOURCE_ROLE='engineering_resource_condition_witness_label_unavailable';
export const RESOURCE_READ_METHOD='n11-private-cgroup-cpu-read-candidate-v1';
export function resourceMode(condition){
 if(!CONDITIONS.includes(condition))throw Error('closed resource condition required');
 return 'engineering-n11-resource-condition-'+condition;
}
export function resourceClockId(context){
 if(!context||Object.keys(context).sort().join(',')!=='controller_origin_ns,generation,method'||context.method!==RESOURCE_METHOD||
  typeof context.controller_origin_ns!=='string'||!/^\d{1,19}$/.test(context.controller_origin_ns)||BigInt(context.controller_origin_ns)>2n**63n-1n||
  !context.generation||Object.keys(context.generation).sort().join(',')!=='owner,peer,pipeline'||
  !Object.values(context.generation).every(v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v)))throw Error('resource clock context required');
 const {owner,peer,pipeline}=context.generation;
 return 'controller-monotonic-'+createHash('sha256').update(JSON.stringify({controller_origin_ns:context.controller_origin_ns,generation:{owner,peer,pipeline},method:RESOURCE_METHOD})).digest('hex');
}

export function resourceDeclaration(){return {method:RESOURCE_METHOD,read_method:RESOURCE_READ_METHOD,quota_usec:200000,period_usec:100000,maximum_samples:128,maximum_read_span_ns:50000000,clock:'controller_elapsed_monotonic_separate_from_worker'};}
