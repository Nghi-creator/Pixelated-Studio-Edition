/** Execute the real relay handlers with in-memory HTTP/process ports, never a container. */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import {PHYSICAL_RECIPES,physicalChallengeMode} from '../../n11/protocols/physicalChallengeProtocol.mjs';
const require=createRequire(import.meta.url);
const current=fs.readFileSync(new URL('./nativeBrowserRelay.cjs',import.meta.url),'utf8');

export function probeRelay(source,mode){
  let handler,listen,lines;
  const camera=new EventEmitter();Object.assign(camera,{pid:2222,exitCode:null,signalCode:null,stdout:new EventEmitter(),kill(){}});
  const server={listen(_port,_host,callback){listen=callback;}};
  class IO {use(){} on(){} to(){return {emit(){}};} }
  const noop=()=>{};
  const modules={
    'node:http':{createServer:h=>{handler=h;return server;}},
    'node:fs':{readFileSync:()=>Buffer.from('export const fixture=true;')},
    'node:readline':{createInterface:()=>{lines=new EventEmitter();return lines;}},
    'node:child_process':{spawn:()=>camera},'socket.io':{Server:IO},
  };
  function load(name){
    if(modules[name])return modules[name];
    if(name.endsWith('nativeFaultModes.cjs'))return {shouldForwardReconnect:()=>false};
    if(name.endsWith('cameraDeathMonitor.cjs'))return {cameraDeathMonitor:noop};
    if(name.endsWith('nativeBrowserShutdown.cjs'))return {ownRelayShutdown:()=>async()=>{}};
    if(name.endsWith('socketAuth.js'))return {createEngineTokenAuth:()=>({useSocketEngineToken:noop})};
    if(name.endsWith('cameraAuthorization.js'))return {canClaimTrustedCamera:()=>false};
    if(name.endsWith('/lobby/lobby.js'))return {createLobbyManager:()=>({registerLobbyHandlers:noop})};
    if(name.endsWith('signalingRelay.js'))return {registerSignalingRelayHandlers:noop,createSignalingPeerRegistry:()=>({})};
    if(name.endsWith('engineErrorHandlers.js'))return {registerEngineErrorHandlers:noop};
    if(name.endsWith('sessionRooms.js'))return {joinSession:noop};
    if(name.endsWith('researchTelemetrySnapshot.js'))return {createResearchTelemetrySnapshot:()=>()=>({schemaVersion:1})};
    if(name.endsWith('linuxProcessCounters.js'))return {readLinuxProcessCounters:()=>({startTimeTicks:1})};
    if(name.endsWith('rawObservationTelemetry.cjs')||name.endsWith('rawObservationModes.cjs'))return require(name);
    throw Error('unexpected relay dependency: '+name);
  }
  vm.runInNewContext(source,{require:load,process:{env:{N10_BROWSER_ACCEPTANCE_MODE:mode,PIXELATED_ENGINE_TOKEN:'fixture-token'},stdout:{write:noop}},Buffer,URL,console,setTimeout:()=>({unref(){}})});
  listen();
  lines.emit('line','N10_ACCEPTANCE '+JSON.stringify({kind:'n11_raw_identity',game_pid:3333,telemetry_path:'/tmp/tmpfixture/telemetry.json'}));
  function request(url,token='fixture-token',method='GET'){
    let status,body,headers;
    handler({url,method,headers:{authorization:'Bearer '+token}},{writeHead:(s,h)=>{status=s;headers=h;},end:b=>{body=String(b);}});
    return {status,body,headers};
  }
  return {request};
}

test('the actual relay serves challenge module imports and the token-protected raw route',()=>{
  for(const mode of [...PHYSICAL_RECIPES.map(physicalChallengeMode),'n11-raw-observation','engineering-n11-resource-condition-no_injected_fault']){
    const relay=probeRelay(current,mode);
    for(const asset of ['/raw-stats.js','/raw-stream.js','/raw-artifact.js']){
      const response=relay.request(asset);assert.equal(response.status,200,mode+' '+asset);
      assert.equal(response.headers['Content-Type'],'text/javascript');
    }
    assert.equal(relay.request('/n11-raw-observation').status,200,mode);
    assert.equal(relay.request('/n11-raw-observation','wrong').status,403);
    assert.equal(relay.request('/n11-raw-observation','fixture-token','POST').status,405);
  }
});
test('unknown and ordinary modes do not install the private raw surface',()=>{
  for(const mode of ['engineering-complete','engineering-n11-physical-challenge-unknown','engineering-n11-physical-challenge-mixed_delay_pressure-extra']){
    const relay=probeRelay(current,mode);
    assert.equal(relay.request('/raw-stats.js').status,404);
    assert.equal(relay.request('/n11-raw-observation').status,404);
  }
});
