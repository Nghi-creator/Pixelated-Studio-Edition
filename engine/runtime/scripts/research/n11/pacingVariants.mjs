/** Closed disposable fixture variants; never a runtime/remote setting API. */
import {conditionVariant} from './conditionProtocol.mjs';
export const CAPACITY_GRID=Object.freeze([0,30000,32000,34000,36000,37500,40000,50000]);
export function pacingVariant({contrast=false,calibrationIndex=null,confirmation=false,condition=null}={}){
 if(condition!==null){if(contrast!==false||confirmation!==false||calibrationIndex!==null)throw Error('mixed condition variants');return conditionVariant(condition);}
 if(typeof contrast!=='boolean'||typeof confirmation!=='boolean'||calibrationIndex!==null&&(!Number.isInteger(calibrationIndex)||calibrationIndex<0||calibrationIndex>=CAPACITY_GRID.length)||calibrationIndex===null&&confirmation||calibrationIndex!==null&&contrast)
  throw Error('one closed pacing variant required');
 if(calibrationIndex!==null){
  const kind=confirmation?'confirmation':'calibration';
  return {delay:CAPACITY_GRID[calibrationIndex],method:'n11-contained-pacing-capacity-'+kind+'-v1',role:'engineering_capacity_'+kind+'_label_unavailable',ownedMethod:'n11-owned-pacing-capacity-'+kind+'-v1'};
 }
 return contrast?{delay:37500,method:'n11-contained-pacing-contrast-v1',role:'engineering_pacing_contrast_label_unavailable',ownedMethod:'n11-owned-pacing-contrast-v1'}:
  {delay:50000,method:'n11-contained-pacing-paired-v1',role:'engineering_pacing_label_unavailable',ownedMethod:'n11-owned-pacing-v1'};
}
