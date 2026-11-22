import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {publishCompletionMarker} from './publishCompletionMarker.mjs';

async function directory(t) {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'n11-marker-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;
}

test('a reader cannot see an empty/partial final marker while its bytes are being written',async t=>{
 const dir=await directory(t),name='n11-phase-relief.json',target=path.join(dir,name);
 let release,started;
 const blocked=new Promise(resolve=>{release=resolve;}),opening=new Promise(resolve=>{started=resolve;});
 const io={...fs,writeFile:async(file,bytes,options)=>{
  const handle=await fs.open(file,options.flag,options.mode);
  try {started();await blocked;await handle.writeFile(bytes);}finally{await handle.close();}
 }};
 const publication=publishCompletionMarker(dir,name,{io});await opening;
 const temporary=(await fs.readdir(dir))[0];assert.equal((await fs.stat(path.join(dir,temporary))).size,0);
 await assert.rejects(fs.stat(target),{code:'ENOENT'});
 release();await publication;
 assert.equal(await fs.readFile(target,'utf8'),'{"complete":true}');
 assert.equal((await fs.stat(target)).size,17);assert.deepEqual(await fs.readdir(dir),[name]);
});
test('exclusive publication never replaces an existing marker',async t=>{
 const dir=await directory(t),name='n11-prime-degraded.json';
 await fs.writeFile(path.join(dir,name),'existing invalid marker');
 await assert.rejects(publishCompletionMarker(dir,name),{code:'EEXIST'});
 assert.equal(await fs.readFile(path.join(dir,name),'utf8'),'existing invalid marker');
 assert.deepEqual(await fs.readdir(dir),[name]);
});
test('concurrent writers publish exactly one complete marker',async t=>{
 const dir=await directory(t),name='n11-complete.json';
 const results=await Promise.allSettled([publishCompletionMarker(dir,name),publishCompletionMarker(dir,name)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.code,'EEXIST');
 assert.equal(await fs.readFile(path.join(dir,name),'utf8'),'{"complete":true}');
 assert.deepEqual(await fs.readdir(dir),[name]);
});
test('failed byte writes cannot leave a final completion marker',async t=>{
 const dir=await directory(t);
 const io={...fs,writeFile:async(file)=>{await fs.writeFile(file,'{');throw Error('injected incomplete write');}};
 await assert.rejects(publishCompletionMarker(dir,'n11-phase-recovery.json',{io}),/incomplete write/);
 assert.deepEqual(await fs.readdir(dir),[]);
});
test('marker names cannot escape their closed phase namespace',async t=>{
 const dir=await directory(t);
 for(const name of ['../escape','n11-phase-healthy.json','unrelated','n11-prime-relief.json/child']) {
  await assert.rejects(publishCompletionMarker(dir,name),/closed completion marker/);
 }
 assert.deepEqual(await fs.readdir(dir),[]);
});
