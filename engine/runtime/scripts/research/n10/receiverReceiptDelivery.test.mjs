import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import test from 'node:test';
import {emitReceiverObservation,startReceiverObservation} from '../../../../../apps/web/src/lib/webrtc/telemetry/receiverObservation.ts';
const {createSignalingPeerRegistry,registerSignalingRelayHandlers}=createRequire(import.meta.url)('../../../dist/src/signaling/signalingRelay.js');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('relay acknowledgments prevent compressed arrivals under a delayed first delivery',async()=>{
 let now=1000,id=0,frames=0,frameCallback;
 const registry=createSignalingPeerRegistry();
 class Socket extends EventEmitter {
  data={sessionId:'session'};rooms=new Set();nsp={sockets:new Map()};relays=[];
  constructor(id){super();this.id=id;}
  join(room){this.rooms.add(room);} leave(room){this.rooms.delete(room);}
  to(room){return{emit:(event,payload)=>this.relays.push({room,event,payload})};}
 }
 const browser=new Socket('browser'),camera=new Socket('camera');camera.data.trustedCamera=true;
 const sockets=new Map([[browser.id,browser],[camera.id,camera]]),trace=[];
 for(const socket of sockets.values()){
  socket.nsp.sockets=sockets;
  registerSignalingRelayHandlers(socket,{peerRegistry:registry,now:()=>now,traceReceiver:row=>trace.push(row)});
 }
 const challenge={peerId:'peer',bindingId:'a'.repeat(64),offerHash:createHash('sha256').update('offer').digest('hex')};
 browser.emit('webrtc-offer',{peerId:'peer',type:'offer',sdp:'offer'});
 camera.emit('webrtc-receiver-bind',challenge);
 const packets=[],timers=new Map(),track={id:'video',kind:'video',readyState:'live'};
 const stream={getVideoTracks:()=>[track]};
 const video={srcObject:stream,requestVideoFrameCallback:callback=>{frameCallback=callback;return ++id;},cancelVideoFrameCallback:()=>{}};
 const pc={connectionState:'connected',iceConnectionState:'completed',getReceivers:()=>[{track}],getStats:async()=>new Map([['inbound',{id:'inbound',type:'inbound-rtp',kind:'video',trackIdentifier:'video',ssrc:1,timestamp:now,framesDecoded:frames+=6}]])};
 const transport={timeout:milliseconds=>({emitWithAck:(event,sample)=>new Promise((resolve,reject)=>packets.push({event,sample,resolve,reject,expires:now+milliseconds}))})};
 const stop=startReceiverObservation({pc,challenge,getVideo:()=>video,getStream:()=>stream,isCurrent:()=>true,
  emit:sample=>emitReceiverObservation(transport,sample),now:()=>now,clockId:'clock',
  schedule:(callback,delay)=>{timers.set(++id,{callback,due:now+delay});return id;},cancel:handle=>timers.delete(handle)});
 async function nextTimer(){const [key,timer]=[...timers][0];now=timer.due;timers.delete(key);timer.callback();await flush();}
 async function deliver(){const packet=packets.shift();assert.ok(now<packet.expires);browser.emit(packet.event,packet.sample,packet.resolve);await flush();}
 await flush();frameCallback(now,{presentedFrames:10});await nextTimer();
 assert.equal(now,1200);assert.equal(packets.length,1);assert.equal(timers.size,0);
 now=1311;await deliver();
 assert.equal([...timers.values()][0].due,1511,'next poll starts 200 ms after relay receipt, not after send');
 now=1402;assert.equal(packets.length,0,'no next report exists at the historical 91 ms compressed-arrival point');
 frameCallback(now,{presentedFrames:16});await nextTimer();await deliver();
 assert.deepEqual(trace.map(row=>row.decision),['forwarded','forwarded']);
 assert.equal(trace[1].received_ms-trace[0].received_ms,200);
 assert.equal(registry.dropReceiverCamera('camera').length,1,'normal disconnect retains its unbind recipient');
 stop();assert.equal(timers.size,0);
});

