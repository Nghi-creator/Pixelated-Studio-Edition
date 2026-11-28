/** Source-frozen, single-use raw challenge acquisition. Never exports a stable pair. */
import fs from "node:fs/promises";
import {constants} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {sourceReceipt,freezeSourceFiles} from "./rawObservation.mjs";
import {nativeSoftwareIdentity} from "../../n10/shared/researchSources.mjs";
import {runNativeBrowserAcceptance} from "../../n10/browser/nativeBrowserAcceptance.mjs";
import {physicalChallengeMode} from "../protocols/physicalChallengeProtocol.mjs";
import {inspectPhysicalChallengeMedia} from "../receipts/physicalChallengeMedia.mjs";
import {createPhysicalChallengeRawExport} from "../export/physicalChallengeRawExport.mjs";
const runtime=fileURLToPath(new URL("../../../../",import.meta.url));
const json=value=>JSON.stringify(value,null,2)+"\n",sha=value=>"sha256:"+createHash("sha256").update(value).digest("hex");
const write=(file,value)=>fs.writeFile(file,json(value),{flag:"wx",mode:0o600});
async function read(file,limit){
 const fd=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const stat=await fd.stat();if(!stat.isFile()||stat.size>limit)throw Error("bounded regular challenge operand required");
   const buffer=Buffer.alloc(stat.size+1),result=await fd.read(buffer,0,buffer.length,0);
   if(result.bytesRead!==stat.size)throw Error("changed challenge operand");return buffer.subarray(0,stat.size);
 }finally{await fd.close();}
}
function argsMap(args,keys){const values={};for(let i=0;i<args.length;i+=2){if(!keys.includes(args[i])||Object.hasOwn(values,args[i])||!args[i+1])throw Error("explicit challenge arguments required");values[args[i]]=args[i+1];}if(Object.keys(values).length!==keys.length)throw Error("explicit challenge arguments required");return values;}
async function canonicalPlan(image,id,coreRevision,recipe,exclusionBytes,dependencies){
 const mode=physicalChallengeMode(recipe),exclusion=JSON.parse(exclusionBytes),excluded=exclusion.excluded_case_ids;
 if(exclusionBytes.toString()!==json(exclusion)||exclusion.retry_allowed!==false)throw Error("canonical no-retry exclusion receipt required");
 if(!/^sha256:[a-f0-9]{64}$/.test(image)||!/^n11-raw-[a-z0-9-]{1,40}$/.test(id)||!/^[a-f0-9]{40}$/.test(coreRevision)||
    !Array.isArray(excluded)||excluded.length>10000||excluded.some(i=>typeof i!=="string"||!/^n11-raw-[a-z0-9-]{1,40}$/.test(i))||new Set(excluded).size!==excluded.length||excluded.includes(id))throw Error("fresh challenge identity and explicit exclusions required");
 const sources=await(dependencies.sources||sourceReceipt)(),nativeHash=await(dependencies.softwareIdentity||(()=>nativeSoftwareIdentity(runtime)))();
 const revision=dependencies.producerRevision?await dependencies.producerRevision():execFileSync("git",["rev-parse","HEAD"],{cwd:runtime,encoding:"utf8"}).trim();
 if(!/^[a-f0-9]{64}$/.test(nativeHash)||!/^[a-f0-9]{40}$/.test(revision)||!sources||typeof sources!=="object"||Array.isArray(sources)||!Object.keys(sources).length||Object.values(sources).some(v=>typeof v!=="string"||!/^[a-f0-9]{64}$/.test(v)))throw Error("explicit native source identity required");
 return {schema_version:"n11-physical-challenge-plan-v1",acquisition_id:id,image,core_revision:coreRevision,producer_revision:revision,
   recipe,mode,source_sha256:sources,source_manifest_hash:sha(json(sources)),native_software_hash:nativeHash,
   exclusion_receipt_sha256:sha(exclusionBytes),excluded_case_ids:excluded,observations:1,
   phases:["degraded","relief","recovery"],target_fps:[30,24,30],action_duration_ms:5000,
   encoded_event_diagnostics:true,receiver_delivery_diagnostics:true,pair_semantics:recipe.includes("_to_")?"changing_between_phases_not_stable_pair":"unqualified_raw_phases",
   labels:"unavailable",retry_allowed:false,n2_pair_admitted:false,empirical_acceptance:false,scope:"engineering_raw_custody_no_diagnosis_or_study_admission"};
}
export async function preparePhysicalChallengePlan(args,dependencies={}){
 const o=argsMap(args,["--image","--acquisition-id","--core-revision","--recipe","--exclusions","--output"]);
 const exclusions=await read(o["--exclusions"],1024*1024);
 const plan=await canonicalPlan(o["--image"],o["--acquisition-id"],o["--core-revision"],o["--recipe"],exclusions,dependencies);
 await fs.writeFile(o["--output"]+".exclusions.json",exclusions,{flag:"wx",mode:0o600});
 await write(o["--output"],plan);return plan;
}
export async function acquirePhysicalChallengePlan(args,dependencies={}){
 const o=argsMap(args,["--plan","--output-directory"]),bytes=await read(o["--plan"],1024*1024),plan=JSON.parse(bytes);
 const exclusions=await read(o["--plan"]+".exclusions.json",1024*1024);
 const expected=await canonicalPlan(plan.image,plan.acquisition_id,plan.core_revision,plan.recipe,exclusions,dependencies);
 if(bytes.toString()!==json(expected))throw Error("changed challenge source/plan");
 const directory=path.resolve(o["--output-directory"]);await fs.mkdir(directory,{mode:0o700});
 await fs.writeFile(path.join(directory,"plan.json"),bytes,{flag:"wx",mode:0o600});
 await fs.writeFile(path.join(directory,"exclusions.json"),exclusions,{flag:"wx",mode:0o600});
 let acquisition;
 try{
   await write(path.join(path.dirname(path.resolve(o["--plan"])),plan.acquisition_id+".attempt.json"),{plan_sha256:sha(bytes),output_directory:directory});
   await(dependencies.freeze||freezeSourceFiles)(directory,plan.source_sha256);
   acquisition=await(dependencies.acquire||runNativeBrowserAcceptance)(plan.image,plan.mode,{comparisonCaseId:plan.acquisition_id,encodedEventDiagnostics:true,receiverDeliveryDiagnostics:true});
   const acquisitionBytes=Buffer.from(json(acquisition));
   await fs.writeFile(path.join(directory,"acquisition.json"),acquisitionBytes,{flag:"wx",mode:0o600});
   const exported=createPhysicalChallengeRawExport(acquisitionBytes,bytes);
   await write(path.join(directory,"raw-export.json"),exported);
   await fs.writeFile(path.join(directory,"command-transcript.json"),exported.transcript_json,{flag:"wx",mode:0o600});
   for(const phase of exported.phases)await fs.writeFile(path.join(directory,phase.phase+".raw.json"),phase.capture_json,{flag:"wx",mode:0o600});
   await write(path.join(directory,"media-inspection.json"),inspectPhysicalChallengeMedia(acquisitionBytes,plan.acquisition_id));
   const after=await canonicalPlan(plan.image,plan.acquisition_id,plan.core_revision,plan.recipe,exclusions,dependencies);
   if(json(after)!==json(plan))throw Error("challenge source changed during acquisition");
   return directory;
 }catch(error){
   if(!acquisition)await write(path.join(directory,"acquisition.json"),error.acquisition||{status:"failed",failure:"setup_unavailable",live_authority:false});
   await write(path.join(directory,"failure.json"),{status:"failed",detail:String(error.message).split("\n")[0].slice(0,512),live_authority:false});throw error;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv[2]==="prepare")await preparePhysicalChallengePlan(process.argv.slice(3));else if(process.argv[2]==="acquire")await acquirePhysicalChallengePlan(process.argv.slice(3));else throw Error("explicit prepare/acquire required");}
 catch{console.error("error: raw physical challenge acquisition failed; retain allocated evidence");process.exitCode=1;}
}
