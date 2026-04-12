import socketio
import gi
import sys
gi.require_version('Gst', '1.0')
gi.require_version('GstWebRTC', '1.0')
from gi.repository import Gst, GstWebRTC, GLib
gi.require_version('GstSdp', '1.0') # 
from gi.repository import Gst, GstWebRTC, GstSdp, GLib 

sio = socketio.Client()
Gst.init(None)

webrtcbin = None
pipeline = None

def handle_offer(offer):
    global webrtcbin, pipeline
    print("[Python] Received React Offer! Building WebRTC Pipeline...")

    if pipeline is not None:
        print("[Python] Pipeline already running! Ignoring duplicate React offer.")
        return
    
    pipeline_str = """
        webrtcbin name=sendrecv bundle-policy=max-bundle
        
        avfvideosrc capture-screen=true capture-screen-cursor=false ! 
        video/x-raw,framerate=30/1 ! 
        videoscale ! video/x-raw,width=640,height=480 !
        videoconvert ! video/x-raw,format=I420 ! 
        vp8enc deadline=1 cpu-used=8 threads=4 target-bitrate=1000000 ! 
        rtpvp8pay pt=96 ! 
        application/x-rtp,media=video,encoding-name=VP8,payload=96 ! 
        sendrecv.
        
        audiotestsrc is-live=true wave=silence ! 
        audioconvert ! audioresample ! 
        opusenc ! rtpopuspay pt=111 ! 
        application/x-rtp,media=audio,encoding-name=OPUS,payload=111 ! 
        sendrecv.
    """

    pipeline = Gst.parse_launch(pipeline_str)
    webrtcbin = pipeline.get_by_name('sendrecv')

    pipeline.set_state(Gst.State.PLAYING)

    def on_ice_candidate(webrtc, mlineindex, candidate):
        sio.emit('webrtc-ice-candidate-backend', {'sdpMLineIndex': mlineindex, 'candidate': candidate})
    webrtcbin.connect('on-ice-candidate', on_ice_candidate)

    def on_answer_created(promise, _, __):
        reply = promise.get_reply()
        answer = reply.get_value('answer')
        webrtcbin.emit('set-local-description', answer, None)
        sio.emit('webrtc-answer', {'type': answer.type.value_nick, 'sdp': answer.sdp.as_text()})
    
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
    sio.emit('python-ready')

@sio.on('webrtc-offer')
def on_offer(offer):
    GLib.idle_add(handle_offer, offer)

@sio.on('webrtc-ice-candidate')
def on_ice(candidate):
    def handle_ice():
        if webrtcbin:
            webrtcbin.emit('add-ice-candidate', candidate['sdpMLineIndex'], candidate['candidate'])
    GLib.idle_add(handle_ice)

# At the bottom of camera.py, replace the connection lines with this:
try:
    print("[Python] Waking up! Forcing WebSocket connection...", flush=True)
    
    # Force 'websocket' to bypass Mac polling hangs
    sio.connect('http://127.0.0.1:8080', transports=['websocket'], wait_timeout=10)
    
    print("[Python] Successfully connected to Node! Starting video loop...", flush=True)
    
    loop = GLib.MainLoop()
    loop.run()
except Exception as e:
    print(f"[Python FATAL ERROR]: {e}", flush=True)