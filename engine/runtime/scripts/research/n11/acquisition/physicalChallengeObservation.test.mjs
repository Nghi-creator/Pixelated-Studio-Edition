/** Invented custody fixtures; no native media or process pressure is started. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {preparePhysicalChallengePlan,acquirePhysicalChallengePlan} from "./physicalChallengeObservation.mjs";
import {fixture as mediaFixture} from "../receipts/physicalChallengeMediaFixture.mjs";
const json=v=>JSON.stringify(v,null,2)+"\n";
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"physical-raw-unit-"));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const exclusions=path.join(dir,"excluded.json");await fs.writeFile(exclusions,json({excluded_case_ids:["n11-raw-used"],retry_allowed:false}));
 const deps={sources:async()=>({"research/unit.py":"a".repeat(64)}),softwareIdentity:async()=>"b".repeat(64),producerRevision:async()=>"c".repeat(40),freeze:async()=>{}};
 const planFile=path.join(dir,"plan.json");
 const args=["--image","sha256:"+"d".repeat(64),"--acquisition-id","n11-raw-unit-physical","--core-revision","e".repeat(40),"--recipe","delay_to_pressure","--exclusions",exclusions,"--output",planFile];
 const plan=await preparePhysicalChallengePlan(args,deps);
 const acquisition=mediaFixture(plan.recipe);
 acquisition.context={image:plan.image,software_hash:plan.native_software_hash};
 for(const phase of acquisition.paired_observation.phases)phase.comparison_case_id=plan.acquisition_id;
 acquisition.events.push({kind:"n11_challenge_command_transcript",live_authority:false,transcript:{recipe:plan.recipe,records:Array.from({length:10},(_,sequence)=>({synthetic_sequence:sequence}))}});
 return {dir,planFile,plan,deps,acquisition,args};
}
test("explicit plan keeps changing semantics, source identity and exclusions",async t=>{
 const f=await fixture(t);assert.equal(f.plan.pair_semantics,"changing_between_phases_not_stable_pair");
 assert.equal(f.plan.n2_pair_admitted,false);assert.equal(f.plan.retry_allowed,false);assert.equal(f.plan.temporal_contract,undefined);
 const args=[...f.args];args[args.indexOf("--acquisition-id")+1]="n11-raw-used";args[args.indexOf("--output")+1]=path.join(f.dir,"excluded-plan.json");
 await assert.rejects(preparePhysicalChallengePlan(args,f.deps),/fresh challenge/);
});
test("source or plan substitution is rejected before allocating an output",async t=>{
 const f=await fixture(t);f.plan.labels="healthy";await fs.writeFile(f.planFile,json(f.plan));
 const output=path.join(f.dir,"none");await assert.rejects(acquirePhysicalChallengePlan(["--plan",f.planFile,"--output-directory",output],f.deps),/changed challenge source\/plan/);
 await assert.rejects(fs.stat(output),{code:"ENOENT"});
});
test("raw export preserves original capture and never emits a stable observation or bundle",async t=>{
 const f=await fixture(t);let calls=0;f.deps.acquire=async(image,mode,options)=>{calls++;assert.equal(options.encodedEventDiagnostics,true);assert.equal(options.receiverDeliveryDiagnostics,true);return f.acquisition;};
 const output=path.join(f.dir,"capture");await acquirePhysicalChallengePlan(["--plan",f.planFile,"--output-directory",output],f.deps);
 const exported=JSON.parse(await fs.readFile(path.join(output,"raw-export.json")));assert.equal(exported.source_media_verified,false);assert.equal(exported.n2_pair_admitted,false);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(output,"acquisition.json"))),f.acquisition);
 for(const name of ["observation.json","bundle.tar"])await assert.rejects(fs.stat(path.join(output,name)),{code:"ENOENT"});
 for(const phase of ["degraded","relief","recovery"])assert.equal(JSON.parse(await fs.readFile(path.join(output,phase+".raw.json"))).phase,phase);
 await assert.rejects(acquirePhysicalChallengePlan(["--plan",f.planFile,"--output-directory",path.join(f.dir,"retry")],f.deps));assert.equal(calls,1);
});
test("native failure retains its partial acquisition and attempt instead of retrying",async t=>{
 const f=await fixture(t),partial={status:"failed",events:[{kind:"partial"}],live_authority:false};
 f.deps.acquire=async()=>{throw Object.assign(Error("native deadline"),{acquisition:partial});};
 const output=path.join(f.dir,"failed");await assert.rejects(acquirePhysicalChallengePlan(["--plan",f.planFile,"--output-directory",output],f.deps),/native deadline/);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(output,"acquisition.json"))),partial);
 assert.equal(JSON.parse(await fs.readFile(path.join(output,"failure.json"))).status,"failed");
});
test("a source change after acquisition leaves the capture retained with a failure receipt",async t=>{
 const f=await fixture(t);let changed=false;f.deps.sources=async()=>({"research/unit.py":(changed?"f":"a").repeat(64)});
 f.deps.acquire=async()=>{changed=true;return f.acquisition;};
 const output=path.join(f.dir,"changed");await assert.rejects(acquirePhysicalChallengePlan(["--plan",f.planFile,"--output-directory",output],f.deps),/source changed during/);
 assert.equal(JSON.parse(await fs.readFile(path.join(output,"acquisition.json"))).status,"passed");
 assert.equal(JSON.parse(await fs.readFile(path.join(output,"failure.json"))).status,"failed");
});

test("failed media inspection retains original raw phases and closes the attempt",async t=>{
 const f=await fixture(t);
 f.acquisition.paired_observation.phases[0].browser_samples[0].connectionState="disconnected";
 f.deps.acquire=async()=>f.acquisition;
 const output=path.join(f.dir,"media-failed");
 await assert.rejects(acquirePhysicalChallengePlan(["--plan",f.planFile,"--output-directory",output],f.deps),/browser evidence/);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(output,"acquisition.json"))),f.acquisition);
 assert.equal(JSON.parse(await fs.readFile(path.join(output,"failure.json"))).status,"failed");
 assert.equal(JSON.parse(await fs.readFile(path.join(output,"degraded.raw.json"))).phase,"degraded");
 await assert.rejects(fs.stat(path.join(output,"media-inspection.json")),{code:"ENOENT"});
});
