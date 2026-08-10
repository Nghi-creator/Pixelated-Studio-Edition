"""Configuration parsing for the Pixelated camera bridge."""

import json
from urllib.parse import quote, urlparse, urlunparse


def parse_max_active_peers(raw_value):
    try:
        configured = int(raw_value)
    except Exception:
        configured = 8
    return min(max(configured, 1), 16)


def parse_ice_servers(raw_value):
    try:
        parsed = json.loads(raw_value)
        return parsed if isinstance(parsed, list) else []
    except Exception as exc:
        print(f"[Python] Failed to parse PIXELATED_ICE_SERVERS: {exc}")
        return []


def iter_ice_urls(server):
    urls = server.get("urls") if isinstance(server, dict) else None
    if isinstance(urls, str):
        return [urls]
    if isinstance(urls, list):
        return [url for url in urls if isinstance(url, str)]
    return []


def configure_ice_servers(webrtc, raw_value):
    for server in parse_ice_servers(raw_value):
        username = server.get("username") if isinstance(server, dict) else None
        credential = server.get("credential") if isinstance(server, dict) else None
        for url in iter_ice_urls(server):
            parsed = urlparse(url)
            if parsed.scheme == "stun":
                webrtc.set_property("stun-server", url)
                print(f"[Python] Configured STUN server: {url}")
            elif parsed.scheme in ["turn", "turns"] and username and credential:
                safe_username = quote(username, safe="")
                safe_credential = quote(credential, safe="")
                netloc = f"{safe_username}:{safe_credential}@{parsed.netloc}"
                turn_url = urlunparse(
                    (parsed.scheme, netloc, parsed.path, "", parsed.query, "")
                )
                webrtc.set_property("turn-server", turn_url)
                print(
                    f"[Python] Configured TURN server: "
                    f"{parsed.scheme}://{parsed.netloc}"
                )


def parse_stream_profile(raw_value):
    try:
        parsed = json.loads(raw_value)
        profile = parsed if isinstance(parsed, dict) else {}
    except Exception as exc:
        print(f"[Python] Failed to parse PIXELATED_STREAM_PROFILE: {exc}")
        profile = {}

    try:
        fps = int(profile.get("fps", 60))
    except Exception:
        fps = 60
    try:
        bitrate_kbps = int(profile.get("bitrateKbps", 1000))
    except Exception:
        bitrate_kbps = 1000

    fps = min(max(fps, 24), 60)
    bitrate_kbps = min(max(bitrate_kbps, 500), 2500)
    raw_profile_id = profile.get("id", "balanced")
    profile_id = raw_profile_id if isinstance(raw_profile_id, str) else "balanced"
    encoder_profiles = {
        "performance": {"cpu_used": 8, "max_quantizer": 56},
        "balanced": {"cpu_used": 6, "max_quantizer": 48},
        "quality": {"cpu_used": 4, "max_quantizer": 42},
    }
    encoder_profile = encoder_profiles.get(profile_id, encoder_profiles["balanced"])
    return {
        "bitrate": bitrate_kbps * 1000,
        "bitrate_kbps": bitrate_kbps,
        "cpu_used": encoder_profile["cpu_used"],
        "fps": fps,
        "id": profile_id,
        "max_quantizer": encoder_profile["max_quantizer"],
    }
