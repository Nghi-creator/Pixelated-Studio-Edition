/* global window */
/** Opt-in loopback Chromium/Socket.IO proof; no engine, game or mutation endpoint. */
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { chromium } from "playwright";
import { Server } from "socket.io";
import { io as client } from "socket.io-client";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { createSignalingPeerRegistry, registerSignalingRelayHandlers } = require("../../dist/src/signaling/signalingRelay.js");
const { createEngineTokenAuth } = require("../../dist/src/signaling/socketAuth.js");
const { canClaimTrustedCamera } = require("../../dist/src/signaling/cameraAuthorization.js");
const { joinSession } = require("../../dist/src/signaling/sessionRooms.js");

test("real Chromium observations follow authenticated peer/camera binding and stop on revocation", { timeout: 25000 }, async (t) => {
  const collector = ts.transpileModule(await readFile(new URL("../../../../apps/web/src/lib/webrtc/telemetry/receiverObservation.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const token = randomBytes(24).toString("hex");
  const html = `<!doctype html><video id="video" autoplay muted playsinline></video><canvas id="canvas" width="320" height="240"></canvas>
<script src="/socket.io/socket.io.js"></script><script type="module">
import {startReceiverObservation, offerDigest} from '/collector.js';
const socket = io({auth:{token:${JSON.stringify(token)},role:'browser'},transports:['websocket']});
window.sent = 0; window.stopped = false; window.error = null; window.starts = 0;
let stop = () => {}; let nonce = null; let active = true; let originalOffer = null;
const rx = new RTCPeerConnection({iceServers:[]}); const tx = new RTCPeerConnection({iceServers:[]});
const video = document.getElementById('video'); let incoming = null;
rx.ontrack = ({track}) => { incoming = new MediaStream([track]); video.srcObject=incoming; video.play().catch(e=>window.error=String(e)); };
const txIce=[], rxIce=[];
tx.onicecandidate=({candidate})=>{if(candidate){if(rx.remoteDescription) rx.addIceCandidate(candidate);else txIce.push(candidate);}};
rx.onicecandidate=({candidate})=>{if(candidate){if(tx.remoteDescription) tx.addIceCandidate(candidate);else rxIce.push(candidate);}};
const canvas=document.getElementById('canvas'); const context=canvas.getContext('2d');
let count=0; const painter=setInterval(()=>{context.fillStyle=count++%2?'#f50':'#05f';context.fillRect(0,0,320,240);},33);
const source=canvas.captureStream(30); tx.addTrack(source.getVideoTracks()[0],source); rx.addTransceiver('video',{direction:'recvonly'});
socket.on('webrtc-receiver-bind',async challenge=>{
 if(challenge.peerId!=='browser_peer'||await offerDigest(originalOffer)!==challenge.offerHash)return;
 window.starts++; stop(); nonce=challenge.bindingId; window.stopped=false;
 stop=startReceiverObservation({pc:rx,challenge,getVideo:()=>video,getStream:()=>incoming,isCurrent:()=>active&&socket.connected,
 emit:sample=>{window.sent++;socket.emit('webrtc-receiver-observation',sample);}});
});
socket.on('webrtc-receiver-unbind', value=>{if(value.bindingId===nonce){stop();window.stopped=true;}});
window.diagnostics=async()=>({state:rx.connectionState,ready:video.readyState,starts:window.starts,
 inbound:Array.from((await rx.getStats()).values()).filter(s=>s.type==='inbound-rtp').map(s=>({kind:s.kind,track:s.trackIdentifier,frames:s.framesDecoded,timestamp:s.timestamp}))});
window.sendOld=sample=>socket.emit('webrtc-receiver-observation',sample);
window.cleanup=()=>{active=false;stop();clearInterval(painter);source.getTracks().forEach(t=>t.stop());rx.close();tx.close();socket.disconnect();};
socket.on('connect',async()=>{try{
 const offer=await rx.createOffer(); await rx.setLocalDescription(offer); originalOffer=offer.sdp;
 await tx.setRemoteDescription(offer); for(const c of rxIce)await tx.addIceCandidate(c);
 const answer=await tx.createAnswer();await tx.setLocalDescription(answer);await rx.setRemoteDescription(answer);
 for(const c of txIce)await rx.addIceCandidate(c);
 socket.emit('webrtc-offer',{sessionId:'smoke',peerId:'browser_peer',type:'offer',sdp:originalOffer});
}catch(error){window.error=String(error);}});
</script>`;
  const http = createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/collector.js" ? "text/javascript" : "text/html");
    res.end(req.url === "/collector.js" ? collector : html);
  });
  const server = new Server(http, { maxHttpBufferSize: 128 * 1024 });
  server.use(createEngineTokenAuth(token).useSocketEngineToken);
  const peers = createSignalingPeerRegistry(2);
  server.on("connection", (socket) => {
    socket.data.trustedCamera = canClaimTrustedCamera("raw", String(socket.handshake.auth.role));
    joinSession(socket, "smoke");
    registerSignalingRelayHandlers(socket, { peerRegistry: peers });
  });
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${http.address().port}`;
  function connect(role, credential = token) {
    const socket = client(url, { auth: { token: credential, role }, transports: ["websocket"], forceNew: true, reconnection: false });
    t.after(() => socket.disconnect());
    return socket;
  }
  const camera = connect("camera");
  const foreign = connect("browser");
  const connected = (socket) => new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
  await Promise.all([connected(camera), connected(foreign)]);
  const invalid = connect("browser", "wrong-token");
  await new Promise((resolve) => invalid.once("connect_error", resolve));
  const samples = []; const bound = [];
  let foreignMessages = 0;
  foreign.on("webrtc-receiver-bind", () => foreignMessages++);
  foreign.on("webrtc-receiver-observation", () => foreignMessages++);
  camera.on("webrtc-receiver-observation", (sample) => samples.push(sample));
  camera.on("webrtc-receiver-bound", (value) => bound.push(value));
  const bindingId = randomBytes(32).toString("hex");
  let offerHash;
  camera.on("webrtc-offer", (offer) => {
    offerHash = createHash("sha256").update(offer.sdp).digest("hex");
    camera.emit("webrtc-receiver-bind", { peerId: offer.peerId, bindingId, offerHash });
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  t.after(async () => { if (!page.isClosed()) await page.evaluate(() => window.cleanup?.()).catch(() => {}); });
  await page.goto(url);
  const until = async (predicate) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 25)); }
    throw new Error(`browser observation deadline: ${JSON.stringify({ bound: bound.length, page: await page.evaluate(async () => ({ error: window.error, sent: window.sent, diagnostics: await window.diagnostics() })) })}`);
  };
  await until(() => samples.length >= 4);
  assert.equal(samples[0].sequence, 0);
  assert.equal(samples[0].receiverSocketId, bound[0].receiverSocketId);
  assert.ok(samples.at(-1).framesDecoded > samples[0].framesDecoded);
  assert.ok(samples.at(-1).presentedFrames > samples[0].presentedFrames);
  const old = samples[0];
  foreign.emit("webrtc-receiver-observation", { peerId: old.peerId, bindingId, clockId: old.clockId, sequence: 0, elapsedNs: 1, framesDecoded: 999, presentedFrames: 999 });
  const nextId = randomBytes(32).toString("hex");
  camera.emit("webrtc-receiver-bind", { peerId: "browser_peer", bindingId: nextId, offerHash });
  await until(() => samples.filter((s) => s.bindingId === nextId).length >= 3);
  await page.evaluate((sample) => window.sendOld(sample), { peerId: old.peerId, bindingId, clockId: old.clockId, sequence: 0, elapsedNs: 1, framesDecoded: 999, presentedFrames: 999 });
  const fresh = samples.filter((sample) => sample.bindingId === nextId);
  assert.equal(fresh[0].sequence, 0);
  assert.notEqual(fresh[0].clockId, old.clockId);
  assert.ok(samples.every((sample) => sample.receiverSocketId === old.receiverSocketId));
  assert.equal(foreignMessages, 0);
  camera.disconnect();
  await page.waitForFunction(() => window.stopped, undefined, { timeout: 3000 });
  const sent = await page.evaluate(() => window.sent);
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => window.sent), sent);
});
