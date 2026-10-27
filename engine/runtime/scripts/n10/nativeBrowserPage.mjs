/** Fresh owned receiver page; imports actual app observation and error handlers. */
export function nativeBrowserHtml(token) {
  return `<!doctype html><video id="video" autoplay muted playsinline></video>
<script src="/socket.io/socket.io.js"></script><script type="module">
import {startReceiverObservation,offerDigest} from '/collector.js';
import {collectBrowserQuality} from '/quality.js';
import {startControlContinuity} from '/continuity.js';
import {bindWebRTCEngineErrors} from '/engine-errors.js';
const socket=io({auth:{token:${JSON.stringify(token)}},transports:['websocket'],reconnection:false});
const initial=new URLSearchParams(location.search).get('peer');
let active=null;const video=document.getElementById('video');
window.timelines={};
function mark(scope,name,values={}){if(!(name in scope.timeline))scope.timeline[name]={at_ms:performance.now(),...values};}
window.failures=[];window.counts={};window.bindings=[];window.unbound=0;window.problem=null;
function stop(){if(!active)return;active.live=false;active.stop();if(active.firstFrameId!==undefined)video.cancelVideoFrameCallback(active.firstFrameId);active.pc.close();active=null;video.srcObject=null;}
async function start(peerId){
 stop();const scope={peerId,pc:new RTCPeerConnection({iceServers:[]}),stream:new MediaStream(),live:true,stop:()=>{},pending:[],sdp:null,timeline:{}};active=scope;window.timelines[peerId]=scope.timeline;mark(scope,'created');
 const pc=scope.pc;pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected')mark(scope,'connected');};pc.addTransceiver('video',{direction:'recvonly'});pc.addTransceiver('audio',{direction:'recvonly'});
 pc.ontrack=({track})=>{if(active!==scope)return;scope.stream.addTrack(track);if(track.kind==='video'){mark(scope,'video_track');scope.firstFrameId=video.requestVideoFrameCallback((_now,item)=>{scope.firstFrameId=undefined;if(active===scope&&scope.live)mark(scope,'first_presented',{presented:item.presentedFrames,pts_ms:item.mediaTime*1000});});}if(video.srcObject!==scope.stream)video.srcObject=scope.stream;video.play().catch(e=>{if(active===scope&&scope.live)window.problem=String(e);});};
 pc.onicecandidate=({candidate})=>{if(candidate&&active===scope)socket.emit('webrtc-ice-candidate',{peerId,sessionId:'native_acceptance',candidate:candidate.toJSON()});};
 bindWebRTCEngineErrors({socket,peerId,isDisposed:()=>active!==scope||!scope.live,report:()=>{},clearRejectedToken:()=>{},
 failStream:message=>{window.failures.push({peerId,message});socket.emit('webrtc-peer-disconnect',{peerId,sessionId:'native_acceptance'});stop();
 if(peerId==='first')start('replacement').catch(e=>window.problem=String(e));}});
 const offer=await pc.createOffer();await pc.setLocalDescription(offer);scope.sdp=offer.sdp;mark(scope,'local_offer');
 if(active===scope)socket.emit('webrtc-offer',{peerId,type:'offer',sdp:offer.sdp,sessionId:'native_acceptance'});
}
socket.on('connect',()=>socket.emit('join-session',{sessionId:'native_acceptance',role:'browser'}));
socket.on('acceptance-joined',()=>start(initial).catch(e=>window.problem=String(e)));
socket.on('webrtc-answer',async answer=>{try{const scope=active;if(!scope||answer.peerId!==scope.peerId)return;
 await scope.pc.setRemoteDescription(answer);mark(scope,'remote_answer');for(const c of scope.pending)await scope.pc.addIceCandidate(c);scope.pending=[];}catch(e){window.problem=String(e);}});
socket.on('webrtc-ice-candidate-backend',async candidate=>{try{const scope=active;if(!scope||candidate.peerId!==scope.peerId)return;
 if(scope.pc.remoteDescription)await scope.pc.addIceCandidate(candidate);else if(scope.pending.length<32)scope.pending.push(candidate);else throw Error('candidate budget');}catch(e){window.problem=String(e);}});
socket.on('webrtc-receiver-bind',async challenge=>{try{const scope=active;if(!scope||challenge.peerId!==scope.peerId||await offerDigest(scope.sdp)!==challenge.offerHash||active!==scope)return;
 scope.stop();window.bindings.push(challenge.bindingId);scope.bindingId=challenge.bindingId;
 scope.stop=startReceiverObservation({pc:scope.pc,challenge,getVideo:()=>video,getStream:()=>scope.stream,isCurrent:()=>active===scope&&scope.live&&socket.connected,
 emit:sample=>{mark(scope,'first_report',{decoded:sample.framesDecoded,presented:sample.presentedFrames});window.counts[scope.peerId]=sample;socket.emit('webrtc-receiver-observation',sample);}});}catch(e){window.problem=String(e);}});
socket.on('webrtc-receiver-unbind',message=>{if(active&&message.peerId===active.peerId&&message.bindingId===active.bindingId){active.stop();window.unbound++;}});
socket.on('acceptance-observer-stop',()=>{if(active)active.stop();});
socket.on('disconnect',()=>{if(active)active.stop();});
window.snapshot=()=>({problem:window.problem,failures:window.failures,counts:window.counts,bindings:window.bindings,unbound:window.unbound,state:active?.pc.connectionState,timelines:window.timelines,timeline_basis:'page_performance_ms_no_native_alignment'});
window.collectQuality=(duration=4000)=>collectBrowserQuality(active.pc,video,duration);
let stopContinuity=null;
window.startControlTrace=()=>{if(stopContinuity)throw Error('trace already started');stopContinuity=startControlContinuity(active.pc,video);};
window.stopControlTrace=()=>{if(!stopContinuity)throw Error('trace not started');return stopContinuity();};
window.stopObservations=()=>{if(active)active.stop();return video.getVideoPlaybackQuality().totalVideoFrames;};
window.videoFrames=()=>video.getVideoPlaybackQuality().totalVideoFrames;
window.cleanup=()=>{stop();socket.disconnect();};
</script>`;
}
