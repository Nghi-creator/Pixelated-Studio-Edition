import os
import sys
import time

import gi
import socketio

from camera_config import (
    configure_ice_servers,
    parse_max_active_peers,
    parse_stream_profile,
)
from live_probe_control.camera_workers import CameraWorkers, workers_enabled
from live_probe_control.receiver_bridge import BrowserReceiverBridge, observation_enabled, valid_bound, valid_report

from camera_protocol import normalize_ice_candidate, normalize_peer_id, validate_offer
from camera_state import write_encoder_telemetry, write_peer_state
from camera_trace import HostTraceRecording
from camera_trace_export import export_camera_trace
from camera_trace_config import parse_trace_config
from camera_trace_hooks import install_host_trace, install_trace_shutdown
from camera_trace_control import PeerRecordingControl

gi.require_version("Gst", "1.0")
gi.require_version("GstWebRTC", "1.0")
gi.require_version("GstSdp", "1.0")
from gi.repository import GLib, Gst, GstSdp, GstWebRTC

sio = socketio.Client()
Gst.init(None)

SESSION_ID = os.environ.get('PIXELATED_SESSION_ID', 'default-session')
ENGINE_TOKEN = os.environ.get('PIXELATED_ENGINE_TOKEN', '')
ICE_SERVERS = os.environ.get('PIXELATED_ICE_SERVERS', '[]')
N5_CAMPAIGN_DIRECTORY = os.environ.get("PIXELATED_N5_CAMPAIGN_DIRECTORY")
N5_WORKLOAD_DECLARATION = None
if N5_CAMPAIGN_DIRECTORY:
    from scenario_harness.camera_runtime import WorkloadDeclaration
    declared_seed = os.environ.get("PIXELATED_N5_WORKLOAD_SEED", "")
    if declared_seed.isascii() and declared_seed.isdecimal() and len(declared_seed) <= 10:
        N5_WORKLOAD_DECLARATION = WorkloadDeclaration(
            os.environ.get("PIXELATED_N5_WORKLOAD_ID", ""), int(declared_seed),
            os.environ.get("PIXELATED_N5_NODE_VERSION", ""),
        )

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
SIGNALING_EPOCH = object()
SIGNALING_CONNECTED = False
try:
    trace_config = parse_trace_config(os.environ)
    STAGE_TRACE = HostTraceRecording(trace_config) if trace_config is not None else None
except ValueError:
    print("[Python] N4 stage tracing disabled: invalid configuration.")
    STAGE_TRACE = None
MAX_ACTIVE_PEERS = parse_max_active_peers(
    os.environ.get("PIXELATED_MAX_STREAM_PEERS", "8")
)

WORKERS = (
    CameraWorkers(parse_stream_profile(STREAM_PROFILE), ICE_SERVERS, MAX_ACTIVE_PEERS)
    if workers_enabled(os.environ) else None
)

RECEIVERS = BrowserReceiverBridge(WORKERS) if observation_enabled(os.environ, WORKERS) else None


def poll_camera_workers():
    updated = False
    for peer_id, token, kind, body, received_ns in WORKERS.poll():
        peer = peers.get(peer_id)
        if peer is None or peer.get('worker_token') != token:
            continue  # A retired generation can never update its replacement.
        if not SIGNALING_CONNECTED or peer.get('signaling_epoch') is not SIGNALING_EPOCH:
            cleanup_peer(peer_id, "disconnect")
            continue
        try:
            if kind == 'failed':
                emit_engine_error(f"Dedicated WebRTC worker failed for peer {peer_id}.")
                cleanup_peer(peer_id, "source_error")
            elif kind == 'answer':
                sio.emit('webrtc-answer', {
                    'sessionId': SESSION_ID, 'peerId': peer_id,
                    'type': 'answer', 'sdp': body['sdp'],
                })
                if RECEIVERS is not None:
                    sio.emit('webrtc-receiver-bind', RECEIVERS.open(peer_id))
            elif kind == 'ice':
                sio.emit('webrtc-ice-candidate-backend', {
                    'sessionId': SESSION_ID, 'peerId': peer_id,
                    'candidate': {'sdpMLineIndex': body['index'], 'candidate': body['candidate']},
                })
            elif kind == 'snapshot':
                peer['worker_snapshot'] = body
                peer['worker_snapshot_received_ns'] = received_ns
                updated = True
        except Exception:
            emit_engine_error(f"Dedicated WebRTC signaling failed for peer {peer_id}.")
            cleanup_peer(peer_id, "source_error")
    if updated:
        publish_encoder_telemetry()
    return True


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

def cleanup_peer(peer_id, reason="shutdown"):
    peer = peers.pop(peer_id, None)
    if not peer:
        return

    if RECEIVERS is not None:
        RECEIVERS.retire(peer_id)
    if peer.get('worker_token') is not None:
        WORKERS.retire(peer_id)  # Never wait for process teardown on GLib.
    stage_trace = peer.get('stage_trace')
    if stage_trace is not None:
        stage_trace.close(reason)
    pipeline = peer.get('pipeline')
    if pipeline:
        pipeline.set_state(Gst.State.NULL)
    write_peer_state(PEER_STATE_PATH, SESSION_ID, peers)
    write_encoder_telemetry(TELEMETRY_STATE_PATH, SESSION_ID, peers)

def create_peer_recording_control(peer_id, config):
    """Explicit experiment-owner API; no socket exposure or work in media callbacks."""
    if len(peers) != 1 or peer_id not in peers:
        raise ValueError("experiment recording requires one exact draining peer")
    peer = peers[peer_id]
    if peer.get('worker_token') is not None:
        raise ValueError("dedicated peer tracing is not supported")
    binding = peer.get('stage_trace')
    if isinstance(binding, PeerRecordingControl):
        raise ValueError("peer recording already has an experiment owner")
    control = PeerRecordingControl(peer['pipeline'], binding, Gst, config)
    peer['stage_trace'] = control
    return control

def handle_offer(offer):
    validation_error = validate_offer(offer)
    if validation_error:
        emit_engine_error(f"Invalid WebRTC offer: {validation_error}")
        return

    peer_id = normalize_peer_id(offer)
    if WORKERS is not None:
        try:
            token = WORKERS.start(peer_id, offer['sdp'])
        except ValueError:
            emit_engine_error("Dedicated WebRTC offer rejected: invalid, changed or at capacity.")
            return
        if peer_id not in peers:
            peers[peer_id] = {
                'worker_token': token, 'worker_snapshot': None,
                'signaling_epoch': SIGNALING_EPOCH,
            }
            write_peer_state(PEER_STATE_PATH, SESSION_ID, peers)
            publish_encoder_telemetry()
        return
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
    
    pacing_element = "identity name=n5_capture_pacer sleep-time=0 signal-handoffs=false silent=true !" if N5_CAMPAIGN_DIRECTORY else ""
    pipeline_str = f"""
        webrtcbin name=sendrecv
        
        ximagesrc name=video_capture display-name=:99 use-damage=false show-pointer=false !
        video/x-raw,framerate={stream_profile['fps']}/1 ! 
        {pacing_element}
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
    try:
        stage_trace = install_host_trace(pipeline, STAGE_TRACE, Gst)
    except Exception:
        print("[Python] N4 stage tracing unavailable: host hooks could not be installed.")
        stage_trace = None
    peers[peer_id] = {
        'frames_dropped_total': 0,
        'frames_in_total': 0,
        'frames_out_total': 0,
        'pipeline': pipeline,
        'post_encoder_queue': post_encoder_queue,
        'pre_encoder_queue': pre_encoder_queue,
        'stage_trace': stage_trace,
        'stream_profile': stream_profile,
        'video_encoder': video_encoder,
        'webrtcbin': webrtcbin,
    }
    owned_peer = peers[peer_id]

    def count_frame_in(_pad, _info):
        peer = peers.get(peer_id)
        if peer is owned_peer:
            peer['frames_in_total'] += 1
        return Gst.PadProbeReturn.OK

    def count_frame_out(_pad, _info):
        peer = peers.get(peer_id)
        if peer is owned_peer:
            peer['frames_out_total'] += 1
        return Gst.PadProbeReturn.OK

    def count_queue_drop(_queue):
        peer = peers.get(peer_id)
        if peer is owned_peer:
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
            cleanup_peer(peer_id, "source_error")
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

@sio.on('webrtc-receiver-bound')
def on_receiver_bound(payload):
    if RECEIVERS is None or not valid_bound(payload):
        return
    epoch, peer = SIGNALING_EPOCH, peers.get(payload['peerId'])
    def accept_bound():
        if SIGNALING_CONNECTED and epoch is SIGNALING_EPOCH and peers.get(payload['peerId']) is peer:
            RECEIVERS.bound(payload)
    GLib.idle_add(accept_bound)


@sio.on('webrtc-receiver-observation')
def on_receiver_observation(payload):
    received_ns = time.monotonic_ns()
    if RECEIVERS is None or not valid_report(payload):
        return
    epoch, peer = SIGNALING_EPOCH, peers.get(payload['peerId'])
    def accept_report():
        if SIGNALING_CONNECTED and epoch is SIGNALING_EPOCH and peers.get(payload['peerId']) is peer:
            RECEIVERS.accept(payload, received_ns)
    GLib.idle_add(accept_report)


@sio.event
def connect():
    global SIGNALING_EPOCH, SIGNALING_CONNECTED
    if WORKERS is not None:
        SIGNALING_EPOCH = object()
        SIGNALING_CONNECTED = True
    print("[Python] Connected to Node.js Switchboard!")
    write_peer_state(PEER_STATE_PATH, SESSION_ID, peers)
    write_encoder_telemetry(TELEMETRY_STATE_PATH, SESSION_ID, peers)
    sio.emit('join-session', {'sessionId': SESSION_ID, 'role': 'camera'})
    sio.emit('python-ready', {'sessionId': SESSION_ID})

@sio.on('webrtc-offer')
def on_offer(offer):
    if WORKERS is None:
        GLib.idle_add(handle_offer, offer)
        return
    epoch = SIGNALING_EPOCH
    def dispatch_offer():
        if SIGNALING_CONNECTED and epoch is SIGNALING_EPOCH:
            handle_offer(offer)
    GLib.idle_add(dispatch_offer)

@sio.on('webrtc-ice-candidate')
def on_ice(payload):
    candidate = normalize_ice_candidate(payload)
    if not candidate:
        emit_engine_error("Invalid WebRTC ICE candidate.")
        return
    peer_id = normalize_peer_id(candidate)
    expected_peer = peers.get(peer_id)
    def handle_ice():
        peer = peers.get(peer_id)
        if expected_peer is not None and peer is not expected_peer:
            return
        if peer and peer.get('worker_token') is not None:
            try:
                WORKERS.ice(peer_id, candidate['sdpMLineIndex'], candidate['candidate'])
            except ValueError:
                emit_engine_error("Dedicated WebRTC ICE rejected.")
                cleanup_peer(peer_id, "source_error")
            return
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
    expected_peer = peers.get(peer_id)
    def handle_disconnect():
        if expected_peer is not None and peers.get(peer_id) is not expected_peer:
            return
        print(f"[Python] Cleaning up WebRTC pipeline for peer {peer_id}.")
        cleanup_peer(peer_id)
    GLib.idle_add(handle_disconnect)

@sio.event
def disconnect(*_reason):
    global SIGNALING_EPOCH, SIGNALING_CONNECTED
    if WORKERS is None:
        return
    SIGNALING_CONNECTED = False
    SIGNALING_EPOCH = object()
    # Socket.IO callbacks enqueue exact current lifetimes; a delayed callback
    # cannot close a replacement created after reconnection.
    owned = list(peers.items())
    def close_disconnected_peers():
        for peer_id, peer in owned:
            if peers.get(peer_id) is peer:
                cleanup_peer(peer_id, "disconnect")
    GLib.idle_add(close_disconnected_peers)


sio.connect('http://localhost:8080', auth={'token': ENGINE_TOKEN})
GLib.timeout_add_seconds(1, publish_encoder_telemetry)
loop = GLib.MainLoop()
if WORKERS is not None:
    import signal
    GLib.timeout_add(20, poll_camera_workers)
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, lambda: loop.quit())
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, lambda: loop.quit())
campaign_service = None
if N5_CAMPAIGN_DIRECTORY:
    from scenario_harness.campaign import CampaignService
    if STAGE_TRACE is None:
        raise ValueError("N5 campaign requires explicitly enabled tracing")
    campaign_service = CampaignService(sys.modules[__name__], N5_CAMPAIGN_DIRECTORY)
    campaign_service.start()
install_trace_shutdown(STAGE_TRACE, GLib, loop)
try:
    loop.run()
finally:
    try:
        if campaign_service is not None:
            campaign_service.close()
    finally:
        try:
            for peer_id in list(peers):
                try:
                    cleanup_peer(peer_id)
                except Exception:
                    print("[Python] Camera peer cleanup failed during shutdown.")
        finally:
            try:
                if WORKERS is not None and not WORKERS.close():
                    print("[Python] Dedicated camera worker cleanup incomplete.")
            finally:
                if STAGE_TRACE is not None:
                    STAGE_TRACE.finish("shutdown")
                    export_camera_trace(STAGE_TRACE, os.environ)
