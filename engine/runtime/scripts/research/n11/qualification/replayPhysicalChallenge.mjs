/** Read-only current-source replay. No browser launch or acquisition is performed. */
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual as same} from 'node:util';
import {sourceReceipt} from '../acquisition/rawObservation.mjs';
import {nativeSoftwareIdentity} from '../../n10/shared/researchSources.mjs';
import {inspectPhysicalChallengeMedia} from '../receipts/physicalChallengeMedia.mjs';
const runtime=fileURLToPath(new URL('../../../../',import.meta.url));

export async function replayPhysicalChallenge(acquisitionBytes,planBytes,deps={}){
  const plan=JSON.parse(planBytes);
  const sources=deps.sources||sourceReceipt;
  const software=deps.software||(()=>nativeSoftwareIdentity(runtime));
  async function check(){
    if(!same(await sources(),plan.source_sha256)||await software()!==plan.native_software_hash)
      throw Error('current producer source/software differs from challenge plan');
  }
  await check();
  const media=inspectPhysicalChallengeMedia(acquisitionBytes,plan.acquisition_id);
  await check();
  return {method:'n11-physical-challenge-producer-replay-v1',source_manifest_replayed:true,
    native_software_identity_replayed:true,media,acquisition_authority:false,empirical_acceptance:false};
}
async function read(file,limit){
  const fd=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{const stat=await fd.stat();if(!stat.isFile()||stat.size>limit)throw Error('bounded regular replay operand required');
    const bytes=Buffer.alloc(stat.size+1),result=await fd.read(bytes,0,bytes.length,0);
    if(result.bytesRead!==stat.size)throw Error('changed replay operand');return bytes.subarray(0,stat.size);
  }finally{await fd.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==4)throw Error('explicit acquisition and plan files required');
    const report=await replayPhysicalChallenge(await read(process.argv[2],4*1024*1024),await read(process.argv[3],1024*1024));
    process.stdout.write(JSON.stringify(report)+'\n');
  }catch(error){console.error('challenge replay failed: '+String(error.message).split('\n')[0]);process.exitCode=1;}
}
