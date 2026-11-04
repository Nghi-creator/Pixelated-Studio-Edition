/** Closed engineering conditions, without diagnostic-label association. */
export const CONDITIONS=Object.freeze(['no_injected_fault','owned_identity_delay','owned_cpu_pressure']);
export const CONDITION_PROTOCOL='n11-contained-condition-witness-v1';
export const CONDITION_MARKER='identity-0-34000-pressure-0-2-cadence-30-24-v1';
export function conditionVariant(condition){
 if(typeof condition!=='string'||!CONDITIONS.includes(condition))throw Error('closed condition required');
 return {method:CONDITION_PROTOCOL,role:'engineering_condition_witness_label_unavailable',ownedMethod:'n11-owned-condition-pacing-v1',
  delay:condition==='owned_identity_delay'?34000:0,pressureWorkers:condition==='owned_cpu_pressure'?2:0};
}
