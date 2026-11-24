/** Exact-byte raw custody only. No stable phase declaration, N2 pair or scientific admission. */
import {createHash} from "node:crypto";
import {isDeepStrictEqual as same} from "node:util";
import {PHYSICAL_METHOD, PHYSICAL_ROLE, physicalChallengeMode} from "../protocols/physicalChallengeProtocol.mjs";
const json = value => JSON.stringify(value, null, 2) + "\n";
const sha = value => "sha256:" + createHash("sha256").update(value).digest("hex");
export function createPhysicalChallengeRawExport(acquisitionBytes, planBytes) {
  if (!Buffer.isBuffer(acquisitionBytes) || !Buffer.isBuffer(planBytes) || acquisitionBytes.length > 4*1024*1024 || planBytes.length > 1024*1024) throw Error("bounded original challenge bytes required");
  const a=JSON.parse(acquisitionBytes),p=JSON.parse(planBytes);
  if(a.status!=="passed"||a.method!==PHYSICAL_METHOD||a.role!==PHYSICAL_ROLE||a.live_authority!==false||
      a.mode!==physicalChallengeMode(p.recipe)||a.challenge_recipe!==p.recipe||p.schema_version!=="n11-physical-challenge-plan-v1"||
      a.context?.image!==p.image||a.context.software_hash!==p.native_software_hash||p.n2_pair_admitted!==false||p.retry_allowed!==false||p.labels!=="unavailable"||p.empirical_acceptance!==false)throw Error("challenge source/plan mismatch");
  const captures=a.paired_observation?.phases;
  if(!Array.isArray(captures)||!same(captures.map(r=>r.phase),["degraded","relief","recovery"])||
      captures.some(r=>r.comparison_case_id!==p.acquisition_id||r.version!=="n11-contained-raw-samples-v1"||r.failure!==null||
        !Array.isArray(r.browser_samples)||r.browser_samples.length!==4||!Array.isArray(r.engine_snapshots)))throw Error("complete raw challenge phases required");
  const traces=a.events?.filter(e=>e.kind==="n11_challenge_command_transcript");
  if(traces?.length!==1||traces[0].live_authority!==false||traces[0].transcript?.recipe!==p.recipe||traces[0].transcript.records?.length!==10)throw Error("complete challenge transcript custody required");
  const transcript=json(traces[0].transcript);
  return {schema_version:"n11-physical-challenge-raw-export-v1",scope:"raw_custody_requires_separate_source_qualification",
    acquisition_sha256:sha(acquisitionBytes),plan_sha256:sha(planBytes),recipe:p.recipe,image:p.image,
    native_software_hash:p.native_software_hash,source_manifest_hash:p.source_manifest_hash,
    transcript_json:transcript,transcript_sha256:sha(transcript),
    phases:captures.map(c=>{const text=json(c);return {phase:c.phase,capture_json:text,capture_sha256:sha(text)};}),
    source_media_verified:false,resource_dose_verified:false,n2_pair_admitted:false,empirical_acceptance:false};
}
