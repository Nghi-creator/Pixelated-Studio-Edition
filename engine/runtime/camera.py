import socketio
import os
import json
from urllib.parse import quote, urlparse, urlunparse
import gi
gi.require_version('Gst', '1.0')
gi.require_version('GstWebRTC', '1.0')
from gi.repository import Gst, GstWebRTC, GLib
gi.require_version('GstSdp', '1.0') # 
from gi.repository import Gst, GstWebRTC, GstSdp, GLib 

sio = socketio.Client()
Gst.init(None)

SESSION_ID = os.environ.get('PIXELATED_SESSION_ID', 'default-session')
ENGINE_TOKEN = os.environ.get('PIXELATED_ENGINE_TOKEN', '')
ICE_SERVERS = os.environ.get('PIXELATED_ICE_SERVERS', '[]')
STREAM_PROFILE = os.environ.get('PIXELATED_STREAM_PROFILE', '{}')
peers = {}

def parse_ice_servers():
    try:
        parsed = json.loads(ICE_SERVERS)
        return parsed if isinstance(parsed, list) else []
    except Exception as exc:
        print(f"[Python] Failed to parse PIXELATED_ICE_SERVERS: {exc}")
        return []

def iter_ice_urls(server):
    urls = server.get('urls') if isinstance(server, dict) else None
    if isinstance(urls, str):
        return [urls]
    if isinstance(urls, list):
        return [url for url in urls if isinstance(url, str)]
    return []

def configure_ice_servers(webrtc):
    for server in parse_ice_servers():
        username = server.get('username') if isinstance(server, dict) else None
        credential = server.get('credential') if isinstance(server, dict) else None

        for url in iter_ice_urls(server):
            parsed = urlparse(url)
            if parsed.scheme == 'stun':
                webrtc.set_property('stun-server', url)
                print(f"[Python] Configured STUN server: {url}")
            elif parsed.scheme in ['turn', 'turns'] and username and credential:
                safe_username = quote(username, safe='')
                safe_credential = quote(credential, safe='')
                netloc = f"{safe_username}:{safe_credential}@{parsed.netloc}"
                turn_url = urlunparse((parsed.scheme, netloc, parsed.path, '', parsed.query, ''))
                webrtc.set_property('turn-server', turn_url)
                print(f"[Python] Configured TURN server: {parsed.scheme}://{parsed.netloc}")

def parse_stream_profile():
    try:
        parsed = json.loads(STREAM_PROFILE)
        profile = parsed if isinstance(parsed, dict) else {}
    except Exception as exc:
        print(f"[Python] Failed to parse PIXELATED_STREAM_PROFILE: {exc}")
        profile = {}

    try:
        fps = int(profile.get('fps', 60))
    except Exception:
        fps = 60

    try:
        bitrate_kbps = int(profile.get('bitrateKbps', 1000))
    except Exception:
        bitrate_kbps = 1000

    fps = min(max(fps, 24), 60)
    bitrate_kbps = min(max(bitrate_kbps, 500), 2500)

    return {
        'bitrate': bitrate_kbps * 1000,
        'bitrate_kbps': bitrate_kbps,
        'fps': fps,
        'id': profile.get('id', 'balanced') if isinstance(profile.get('id', 'balanced'), str) else 'balanced'
    }

def emit_engine_error(message):
    print(f"[Python] Engine error: {message}")
    try:
        sio.emit('engine-error', {
            'sessionId': SESSION_ID,
            'message': message,
            'source': 'camera'
        })
    except Exception as exc:
        print(f"[Python] Failed to emit engine-error: {exc}")

def normalize_peer_id(payload):
    peer_id = payload.get('peerId') if isinstance(payload, dict) else None
    return peer_id if isinstance(peer_id, str) and peer_id else 'default'

def cleanup_peer(peer_id):
    peer = peers.pop(peer_id, None)
    if not peer:
        return

    pipeline = peer.get('pipeline')
    if pipeline:
        pipeline.set_state(Gst.State.NULL)

def handle_offer(offer):
    peer_id = normalize_peer_id(offer)
    print(f"[Python] Received React Offer for peer {peer_id}! Building WebRTC Pipeline...")

    if peer_id in peers:
        print(f"[Python] Pipeline already running for peer {peer_id}! Ignoring duplicate offer.")
        return

    stream_profile = parse_stream_profile()
    print(f"[Python] Stream profile: {stream_profile['id']} ({stream_profile['fps']}fps, {stream_profile['bitrate_kbps']}kbps)")
    
    pipeline_str = f"""
        webrtcbin name=sendrecv
        
        ximagesrc display-name=:99 use-damage=false show-pointer=false ! 
        video/x-raw,framerate={stream_profile['fps']}/1 ! 
        videoconvert ! video/x-raw,format=I420 ! 
        queue max-size-buffers=1 leaky=downstream ! 
        vp8enc deadline=1 cpu-used=8 threads=4 end-usage=cbr target-bitrate={stream_profile['bitrate']} max-quantizer=56 min-quantizer=4 keyframe-max-dist=120 error-resilient=1 ! 
        rtpvp8pay pt=96 ! 
        queue max-size-buffers=1 leaky=downstream ! 
        application/x-rtp,media=video,encoding-name=VP8,payload=96 ! sendrecv.
        
        pulsesrc device=auto_null.monitor provide-clock=false ! 
        audioconvert ! audioresample ! queue max-size-buffers=3 leaky=downstream ! 
        opusenc ! rtpopuspay pt=111 ! queue ! 
        application/x-rtp,media=audio,encoding-name=OPUS,payload=111 ! sendrecv.
    """
    pipeline = Gst.parse_launch(pipeline_str)
    webrtcbin = pipeline.get_by_name('sendrecv')
    configure_ice_servers(webrtcbin)
    peers[peer_id] = {
        'pipeline': pipeline,
        'webrtcbin': webrtcbin,
    }

    bus = pipeline.get_bus()
    bus.add_signal_watch()

    def on_bus_message(_, message):
        if message.type == Gst.MessageType.ERROR:
            err, debug = message.parse_error()
            emit_engine_error(f"GStreamer error for peer {peer_id}: {err.message}")
            if debug:
                print(f"[Python] GStreamer debug: {debug}")
            cleanup_peer(peer_id)
        elif message.type == Gst.MessageType.WARNING:
            warn, debug = message.parse_warning()
            print(f"[Python] GStreamer warning for peer {peer_id}: {warn.message}")
            if debug:
                print(f"[Python] GStreamer warning debug: {debug}")

    bus.connect('message', on_bus_message)

    pipeline.set_state(Gst.State.PLAYING)

    def on_ice_candidate(webrtc, mlineindex, candidate):
        sio.emit('webrtc-ice-candidate-backend', {
            'sessionId': SESSION_ID,
            'peerId': peer_id,
            'candidate': {'sdpMLineIndex': mlineindex, 'candidate': candidate}
        })
    webrtcbin.connect('on-ice-candidate', on_ice_candidate)

    def on_answer_created(promise, _, __):
        reply = promise.get_reply()
        answer = reply.get_value('answer')
        webrtcbin.emit('set-local-description', answer, None)
        sio.emit('webrtc-answer', {
            'sessionId': SESSION_ID,
            'peerId': peer_id,
            'type': answer.type.value_nick,
            'sdp': answer.sdp.as_text()
        })
    
    def on_offer_set(promise, _, __):
        promise = Gst.Promise.new_with_change_func(on_answer_created, None, None)
        webrtcbin.emit('create-answer', None, promise)

    res, sdp_msg = GstSdp.SDPMessage.new_from_text(offer['sdp'])
    offer_sdp = GstWebRTC.WebRTCSessionDescription.new(GstWebRTC.WebRTCSDPType.OFFER, sdp_msg)
    promise = Gst.Promise.new_with_change_func(on_offer_set, None, None)
    webrtcbin.emit('set-remote-description', offer_sdp, promise)

@sio.event
def connect():
    print("[Python] Connected to Node.js Switchboard!")
    sio.emit('join-session', {'sessionId': SESSION_ID, 'role': 'camera'})
    sio.emit('python-ready', {'sessionId': SESSION_ID})

@sio.on('webrtc-offer')
def on_offer(offer):
    GLib.idle_add(handle_offer, offer)

@sio.on('webrtc-ice-candidate')
def on_ice(candidate):
    peer_id = normalize_peer_id(candidate)
    def handle_ice():
        peer = peers.get(peer_id)
        webrtcbin = peer.get('webrtcbin') if peer else None
        if webrtcbin:
            webrtcbin.emit('add-ice-candidate', candidate['sdpMLineIndex'], candidate['candidate'])
    GLib.idle_add(handle_ice)

@sio.on('webrtc-peer-disconnect')
def on_peer_disconnect(payload):
    peer_id = normalize_peer_id(payload)
    def handle_disconnect():
        print(f"[Python] Cleaning up WebRTC pipeline for peer {peer_id}.")
        cleanup_peer(peer_id)
    GLib.idle_add(handle_disconnect)

sio.connect('http://localhost:8080', auth={'token': ENGINE_TOKEN})
loop = GLib.MainLoop()
loop.run()
