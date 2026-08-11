import os

import gi
import socketio

from camera_config import (
    configure_ice_servers,
    parse_max_active_peers,
    parse_stream_profile,
)
from camera_protocol import normalize_ice_candidate, normalize_peer_id, validate_offer
from camera_state import write_encoder_telemetry, write_peer_state

gi.require_version("Gst", "1.0")
gi.require_version("GstWebRTC", "1.0")
gi.require_version("GstSdp", "1.0")
from gi.repository import GLib, Gst, GstSdp, GstWebRTC

sio = socketio.Client()
Gst.init(None)

SESSION_ID = os.environ.get('PIXELATED_SESSION_ID', 'default-session')
ENGINE_TOKEN = os.environ.get('PIXELATED_ENGINE_TOKEN', '')
ICE_SERVERS = os.environ.get('PIXELATED_ICE_SERVERS', '[]')
STREAM_PROFILE = os.environ.get('PIXELATED_STREAM_PROFILE', '{}')
PEER_STATE_PATH = os.environ.get(
    'PIXELATED_CAMERA_PEER_STATE_PATH',
    '/run/pixelated/camera-peers.json',
)
TELEMETRY_STATE_PATH = os.environ.get(
    'PIXELATED_CAMERA_TELEMETRY_STATE_PATH',
    '/run/pixelated/camera-telemetry.json',
)
peers = {}
MAX_ACTIVE_PEERS = parse_max_active_peers(
    os.environ.get("PIXELATED_MAX_STREAM_PEERS", "8")
)

def publish_encoder_telemetry():
    write_encoder_telemetry(TELEMETRY_STATE_PATH, SESSION_ID, peers)
    return True

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

def cleanup_peer(peer_id):
    peer = peers.pop(peer_id, None)
    if not peer:
        return

    pipeline = peer.get('pipeline')
    if pipeline:
        pipeline.set_state(Gst.State.NULL)
    write_peer_state(PEER_STATE_PATH, SESSION_ID, peers)
    write_encoder_telemetry(TELEMETRY_STATE_PATH, SESSION_ID, peers)

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

    stream_profile = parse_stream_profile(STREAM_PROFILE)
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
        queue name=pre_encoder_queue max-size-buffers=1 leaky=downstream !
        vp8enc name=video_encoder deadline=1 cpu-used={stream_profile['cpu_used']} threads=4 end-usage=cbr target-bitrate={stream_profile['bitrate']} max-quantizer={stream_profile['max_quantizer']} min-quantizer=4 keyframe-max-dist=120 error-resilient=1 !
        rtpvp8pay pt=96 ! 
        queue name=post_encoder_queue max-size-buffers=1 leaky=downstream !
        application/x-rtp,media=video,encoding-name=VP8,payload=96 ! sendrecv.
        
        pulsesrc device=auto_null.monitor provide-clock=false ! 
        audioconvert ! audioresample ! queue max-size-buffers=3 leaky=downstream ! 
        opusenc ! rtpopuspay pt=111 ! queue ! 
        application/x-rtp,media=audio,encoding-name=OPUS,payload=111 ! sendrecv.
    """
    pipeline = Gst.parse_launch(pipeline_str)
    webrtcbin = pipeline.get_by_name('sendrecv')
    pre_encoder_queue = pipeline.get_by_name('pre_encoder_queue')
    video_encoder = pipeline.get_by_name('video_encoder')
    post_encoder_queue = pipeline.get_by_name('post_encoder_queue')
    configure_ice_servers(webrtcbin, ICE_SERVERS)
    peers[peer_id] = {
        'frames_dropped_total': 0,
        'frames_in_total': 0,
        'frames_out_total': 0,
        'pipeline': pipeline,
        'post_encoder_queue': post_encoder_queue,
        'pre_encoder_queue': pre_encoder_queue,
        'stream_profile': stream_profile,
        'video_encoder': video_encoder,
        'webrtcbin': webrtcbin,
    }

    def count_frame_in(_pad, _info):
        peer = peers.get(peer_id)
        if peer is not None:
            peer['frames_in_total'] += 1
        return Gst.PadProbeReturn.OK

    def count_frame_out(_pad, _info):
        peer = peers.get(peer_id)
        if peer is not None:
            peer['frames_out_total'] += 1
        return Gst.PadProbeReturn.OK

    def count_queue_drop(_queue):
        peer = peers.get(peer_id)
        if peer is not None:
            peer['frames_dropped_total'] += 1

    pre_encoder_queue.get_static_pad('sink').add_probe(
        Gst.PadProbeType.BUFFER,
        count_frame_in,
    )
    video_encoder.get_static_pad('src').add_probe(
        Gst.PadProbeType.BUFFER,
        count_frame_out,
    )
    pre_encoder_queue.connect('overrun', count_queue_drop)
    post_encoder_queue.connect('overrun', count_queue_drop)
    write_peer_state(PEER_STATE_PATH, SESSION_ID, peers)
    write_encoder_telemetry(TELEMETRY_STATE_PATH, SESSION_ID, peers)

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
    write_peer_state(PEER_STATE_PATH, SESSION_ID, peers)
    write_encoder_telemetry(TELEMETRY_STATE_PATH, SESSION_ID, peers)
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
GLib.timeout_add_seconds(1, publish_encoder_telemetry)
loop = GLib.MainLoop()
loop.run()
