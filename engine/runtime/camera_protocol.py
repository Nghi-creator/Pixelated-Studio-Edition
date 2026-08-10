"""Validation helpers for the camera bridge signalling protocol."""

MAX_WEBRTC_SDP_LENGTH = 64 * 1024
MAX_ICE_CANDIDATE_LENGTH = 4 * 1024
MAX_ICE_FIELD_LENGTH = 256


def normalize_peer_id(payload):
    peer_id = payload.get("peerId") if isinstance(payload, dict) else None
    return peer_id if isinstance(peer_id, str) and peer_id else "default"


def _valid_peer_id(peer_id):
    return (
        isinstance(peer_id, str)
        and bool(peer_id)
        and len(peer_id) <= 128
        and all(character.isalnum() or character in "_-" for character in peer_id)
    )


def normalize_ice_candidate(payload):
    if not isinstance(payload, dict):
        return None
    peer_id = payload.get("peerId")
    candidate = payload.get("candidate")
    sdp_mline_index = payload.get("sdpMLineIndex")
    sdp_mid = payload.get("sdpMid")
    if (
        not _valid_peer_id(peer_id)
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
        "candidate": candidate,
        "peerId": peer_id,
        "sdpMLineIndex": sdp_mline_index,
        "sdpMid": sdp_mid,
    }


def validate_offer(offer):
    if not isinstance(offer, dict):
        return "Offer must be an object."
    if offer.get("type") != "offer":
        return "Offer type must be 'offer'."
    if not _valid_peer_id(offer.get("peerId")):
        return "Offer peer id is invalid."
    sdp = offer.get("sdp")
    if not isinstance(sdp, str) or not sdp or len(sdp) > MAX_WEBRTC_SDP_LENGTH:
        return "Offer SDP is missing or too large."
    return None
