import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createRawObservationTelemetry}=createRequire(import.meta.url)('./rawObservationTelemetry.cjs');

function fixture() {
  const camera={pid:process.pid+1,exitCode:null,signalCode:null};
  const game=process.pid+2;
  const counters=new Map([process.pid,camera.pid,game].map(pid=>[pid,{startTimeTicks:pid*2}]));
  let stopped=0,created=0,options;
  const endpoint=createRawObservationTelemetry({token:'private-test-token',camera,readCounters:pid=>counters.get(pid),
    createSnapshot:value=>{created++;options=value;return Object.assign(()=>({sampleSequence:7,capturedAt:'2026-11-02T00:00:00Z'}),{stop:()=>stopped++});}});
  const initialize=()=>endpoint.initialize({kind:'n11_raw_identity',game_pid:game,telemetry_path:'/tmp/tmpfixture/telemetry.json'});
  function request({url='/n11-raw-observation',method='GET',authorization='Bearer private-test-token'}={}){
    let code,body;const handled=endpoint.handle({url,method,headers:{authorization}},{writeHead:c=>code=c,end:b=>body=JSON.parse(b)});
    return {handled,code,body};
  }
  return {endpoint,initialize,request,counters,camera,game,get options(){return options;},get created(){return created;},get stopped(){return stopped;}};
}

test('raw read route is unavailable before ownership and rejects unauthorized methods',()=>{
  const f=fixture();assert.equal(f.request().code,503);f.initialize();
  assert.equal(f.request({authorization:'wrong'}).code,403);
  assert.equal(f.request({method:'POST'}).code,405);
  assert.equal(f.request({url:'/other'}).handled,false);
  assert.deepEqual(f.request().body,{sampleSequence:7,capturedAt:'2026-11-02T00:00:00Z'});
  assert.equal(f.options.getRuntimeState().cameraPeerStatePath,'/tmp/tmpfixture/peers.json');
  assert.equal(f.options.getRuntimeState().retroarchProcess.pid,f.game);
  assert.throws(f.initialize);assert.equal(f.created,1);
});

test('game or parent-camera replacement cannot acquire another process role',()=>{
  for(const role of ['game','camera']){
    const f=fixture();f.initialize();
    const pid=role==='game'?f.game:f.camera.pid;
    f.counters.set(pid,{startTimeTicks:999});
    assert.equal(f.request().code,503);
    assert.equal(f.options.getRuntimeState().activeSessionId,null);
  }
  const f=fixture();f.initialize();f.camera.exitCode=0;assert.equal(f.request().code,503);
  f.endpoint.stop();assert.equal(f.stopped,1);
});

test('raw setup refuses paths outside the directly owned temporary state',()=>{
  const f=fixture();
  assert.throws(()=>f.endpoint.initialize({kind:'n11_raw_identity',game_pid:f.game,telemetry_path:'/etc/private'}));
  assert.equal(f.created,0);
});
