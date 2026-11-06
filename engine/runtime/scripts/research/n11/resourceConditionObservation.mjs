/** Explicit one-shot resource variant; never resumes a closed study. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareConditionPlan,acquireConditionPlan} from './conditionObservation.mjs';
export const prepareResourceConditionPlan=args=>prepareConditionPlan(args,{resource:true});
export const acquireResourceConditionPlan=(args,dependencies={})=>acquireConditionPlan(args,{...dependencies,resource:true});
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv[2]==='prepare')await prepareResourceConditionPlan(process.argv.slice(3));
  else if(process.argv[2]==='acquire')await acquireResourceConditionPlan(process.argv.slice(3));
  else throw Error('use prepare or acquire');
 }catch{console.error('error: resource condition observation failed; retain any allocated evidence directory');process.exitCode=1;}
}
