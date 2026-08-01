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
PEER_STATE_PATH = os.environ.get('PIXELATED_CAMERA_PEER_STATE_PATH', '/tmp/pixelated_camera_peers.json')
peers = {}

def parse_max_active_peers():
    try:
        configured = int(os.environ.get('PIXELATED_MAX_STREAM_PEERS', '8'))
    except Exception:
        configured = 8
    return min(max(configured, 1), 16)

MAX_ACTIVE_PEERS = parse_max_active_peers()
MAX_WEBRTC_SDP_LENGTH = 64 * 1024
MAX_ICE_CANDIDATE_LENGTH = 4 * 1024
MAX_ICE_FIELD_LENGTH = 256

def write_peer_state():
    try:
        with open(PEER_STATE_PATH, 'w', encoding='utf-8') as state_file:
            json.dump({
                'peerCount': len(peers),
                'peerIds': sorted(peers.keys()),
                'sessionId': SESSION_ID
            }, state_file)
    except Exception as exc:
        print(f"[Python] Failed to write peer state: {exc}")

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

    profile_id = profile.get('id', 'balanced') if isinstance(profile.get('id', 'balanced'), str) else 'balanced'
    encoder_profiles = {
        'performance': {'cpu_used': 8, 'max_quantizer': 56},
        'balanced': {'cpu_used': 6, 'max_quantizer': 48},
        'quality': {'cpu_used': 4, 'max_quantizer': 42},
    }
    encoder_profile = encoder_profiles.get(profile_id, encoder_profiles['balanced'])

    return {
        'bitrate': bitrate_kbps * 1000,
        'bitrate_kbps': bitrate_kbps,
        'cpu_used': encoder_profile['cpu_used'],
        'fps': fps,
        'id': profile_id,
        'max_quantizer': encoder_profile['max_quantizer'],
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

def normalize_ice_candidate(payload):
    if not isinstance(payload, dict):
        return None

    peer_id = payload.get('peerId')
    candidate = payload.get('candidate')
    sdp_mline_index = payload.get('sdpMLineIndex')
    sdp_mid = payload.get('sdpMid')

    if (
        not isinstance(peer_id, str)
        or not peer_id
        or len(peer_id) > 128
        or not all(character.isalnum() or character in '_-' for character in peer_id)
        or not isinstance(candidate, str)
        or not candidate
        or len(candidate) > MAX_ICE_CANDIDATE_LENGTH
        or not isinstance(sdp_mline_index, int)
        or isinstance(sdp_mline_index, bool)
        or sdp_mline_index < 0
        or sdp_mline_index > 65535
        or (
            sdp_mid is not None
            and (not isinstance(sdp_mid, str) or len(sdp_mid) > MAX_ICE_FIELD_LENGTH)
        )
    ):
        return None

    return {
        'candidate': candidate,
        'peerId': peer_id,
        'sdpMLineIndex': sdp_mline_index,
        'sdpMid': sdp_mid,
    }

def validate_offer(offer):
    if not isinstance(offer, dict):
        return "Offer must be an object."
    if offer.get('type') != 'offer':
        return "Offer type must be 'offer'."

    peer_id = offer.get('peerId')
    if (
        not isinstance(peer_id, str)
        or not peer_id
        or len(peer_id) > 128
        or not all(character.isalnum() or character in '_-' for character in peer_id)
    ):
        return "Offer peer id is invalid."

    sdp = offer.get('sdp')
    if not isinstance(sdp, str) or not sdp or len(sdp) > MAX_WEBRTC_SDP_LENGTH:
        return "Offer SDP is missing or too large."
    return None

def cleanup_peer(peer_id):
    peer = peers.pop(peer_id, None)
    if not peer:
        return

    pipeline = peer.get('pipeline')
    if pipeline:
        pipeline.set_state(Gst.State.NULL)
    write_peer_state()

def handle_offer(offer):
    validation_error = validate_offer(offer)
    if validation_error:
        emit_engine_error(f"Invalid WebRTC offer: {validation_error}")
        return

    peer_id = normalize_peer_id(offer)
    try:
        result, sdp_msg = GstSdp.SDPMessage.new_from_text(offer['sdp'])
    except Exception as exc:
        emit_engine_error(f"Invalid WebRTC offer SDP: {exc}")
        return
    if result != GstSdp.SDPResult.OK or sdp_msg is None:
        emit_engine_error("Invalid WebRTC offer SDP.")
        return

    print(f"[Python] Received React Offer for peer {peer_id}! Building WebRTC Pipeline...")

    if peer_id in peers:
        print(f"[Python] Pipeline already running for peer {peer_id}! Ignoring duplicate offer.")
        return
    if len(peers) >= MAX_ACTIVE_PEERS:
        emit_engine_error(
            f"WebRTC stream capacity reached ({MAX_ACTIVE_PEERS} active peers)."
        )
        return

    stream_profile = parse_stream_profile()
    print(
        f"[Python] Stream profile: {stream_profile['id']} "
        f"({stream_profile['fps']}fps, {stream_profile['bitrate_kbps']}kbps, "
        f"cpu-used={stream_profile['cpu_used']}, max-quantizer={stream_profile['max_quantizer']})"
    )
    
    pipeline_str = f"""
        webrtcbin name=sendrecv
        
        ximagesrc display-name=:99 use-damage=false show-pointer=false ! 
        video/x-raw,framerate={stream_profile['fps']}/1 ! 
        videoconvert ! video/x-raw,format=I420 ! 
        queue max-size-buffers=1 leaky=downstream ! 
        vp8enc deadline=1 cpu-used={stream_profile['cpu_used']} threads=4 end-usage=cbr target-bitrate={stream_profile['bitrate']} max-quantizer={stream_profile['max_quantizer']} min-quantizer=4 keyframe-max-dist=120 error-resilient=1 !
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
    write_peer_state()

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

    offer_sdp = GstWebRTC.WebRTCSessionDescription.new(GstWebRTC.WebRTCSDPType.OFFER, sdp_msg)
    promise = Gst.Promise.new_with_change_func(on_offer_set, None, None)
    webrtcbin.emit('set-remote-description', offer_sdp, promise)

@sio.event
def connect():
    print("[Python] Connected to Node.js Switchboard!")
    write_peer_state()
    sio.emit('join-session', {'sessionId': SESSION_ID, 'role': 'camera'})
    sio.emit('python-ready', {'sessionId': SESSION_ID})

@sio.on('webrtc-offer')
def on_offer(offer):
    GLib.idle_add(handle_offer, offer)

@sio.on('webrtc-ice-candidate')
def on_ice(payload):
    candidate = normalize_ice_candidate(payload)
    if not candidate:
        emit_engine_error("Invalid WebRTC ICE candidate.")
        return
    peer_id = normalize_peer_id(candidate)
    def handle_ice():
        peer = peers.get(peer_id)
        webrtcbin = peer.get('webrtcbin') if peer else None
        if webrtcbin:
            try:
                webrtcbin.emit(
                    'add-ice-candidate',
                    candidate['sdpMLineIndex'],
                    candidate['candidate'],
                )
            except Exception as exc:
                emit_engine_error(f"Invalid WebRTC ICE candidate: {exc}")
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
