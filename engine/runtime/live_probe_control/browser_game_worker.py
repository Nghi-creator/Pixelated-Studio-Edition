"""Explicit disposable real-game/browser experiment; no normal gameplay integration."""

import json
import math
import os
import select
import signal
import sys
import time
from dataclasses import asdict

from .contracts import SECOND, Request, integer
from .controller import CadenceController
from .game_scene import GameScene
from .webrtc_worker import POLICY, WebRTCPort, rate_met

STATS = (
    "framesReceived",
    "framesDecoded",
    "framesDropped",
    "freezeCount",
    "totalFreezesDuration",
    "totalDecodeTime",
    "jitterBufferDelay",
    "jitterBufferEmittedCount",
    "frameWidth",
    "frameHeight",
    "keyFramesDecoded",
    "packetsLost",
    "bytesReceived",
)


def strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate browser message key")
        result[key] = value
    return result


def decode_message(line):
    if len(line) > 32768:
        raise ValueError("browser message limit")
    item = json.loads(line, object_pairs_hook=strict_object)
    if not isinstance(item, dict):
        raise TypeError("browser object required")
    fields = {
        "answer": {"type", "sdp"},
        "ice": {"type", "index", "candidate"},
        "frame": {
            "type",
            "pts_ns",
            "browser_at_ns",
            "presented_frames",
            "width",
            "height",
        },
        "health": {"type", "state"},
        "stats": {"type", "browser_at_ns", "values"},
        "visual": {"type", "browser_at_ns", "hash", "color_bins"},
    }
    kind = item.get("type")
    if kind not in fields or set(item) != fields[kind]:
        raise ValueError("unsupported browser message")
    if kind == "answer":
        if type(item["sdp"]) is not str or not 0 < len(item["sdp"]) <= 16384:
            raise ValueError("invalid browser description")
    elif kind == "ice":
        integer(item["index"], 0, 0)
        if type(item["candidate"]) is not str or len(item["candidate"]) > 4096:
            raise ValueError("invalid browser candidate")
    elif kind == "health":
        if item["state"] not in (
            "new",
            "connecting",
            "connected",
            "disconnected",
            "failed",
            "closed",
        ):
            raise ValueError("invalid browser health")
    else:
        integer(item["browser_at_ns"], 0, 2**53 - 1)
        if kind == "frame":
            integer(item["pts_ns"], 0, 2**53 - 1)
            integer(item["presented_frames"], 1, 10000)
            if (
                type(item["width"]) is not int
                or type(item["height"]) is not int
                or (item["width"], item["height"]) != (640, 480)
            ):
                raise ValueError("browser dimensions changed")
        elif kind == "stats":
            values = item["values"]
            if not isinstance(values, dict) or set(values) != set(STATS):
                raise ValueError("invalid browser stats inventory")
            for value in values.values():
                if value is not None and (
                    type(value) not in (int, float)
                    or not math.isfinite(value)
                    or not 0 <= value <= 2**53 - 1
                ):
                    raise ValueError("invalid browser counter")
        else:
            integer(item["hash"], 0, 2**32 - 1)
            integer(item["color_bins"], 0, 512)
    return item


class Channel:
    def __init__(self):
        self.buffer = b""
        self.count = 0

    def send(self, item):
        print(json.dumps(item, allow_nan=False, separators=(",", ":")), flush=True)

    def read(self):
        messages = []
        if select.select([sys.stdin.buffer], [], [], 0)[0]:
            data = os.read(sys.stdin.fileno(), 16384)
            if not data:
                raise ValueError("browser control pipe closed")
            self.buffer += data
        if len(self.buffer) > 65536:
            raise ValueError("browser control buffer exceeded")
        for _ in range(64):
            if b"\n" not in self.buffer:
                break
            line, self.buffer = self.buffer.split(b"\n", 1)
            self.count += 1
            if self.count > 2000:
                raise ValueError("browser message count exceeded")
            messages.append(decode_message(line))
        return messages


class _BrowserEndpoint:
    def __init__(self, channel):
        self.channel = channel

    def emit(self, action, index, candidate):
        if action != "add-ice-candidate":
            raise ValueError("invalid browser signaling action")
        self.channel.send({"type": "ice", "index": index, "candidate": candidate})


class GameBrowserPort(WebRTCPort):
    # This module is launched only as a dedicated process by its explicit CLI.
    # Importing/constructing the port alone still cannot arm process teardown.
    dedicated_process = False
    dimensions = (640, 480)

    def __init__(self, gst, glib, sdp, rtc, scene, channel):
        super().__init__(gst, glib)
        self.sdp, self.rtc = sdp, rtc
        self.scene, self.channel = scene, channel
        self.browser_state = "new"
        self.answered = False
        self.pending_ice = []
        self.browser_stats = []
        self.visual_samples = []
        self.resources = []
        self.browser_frames = []
        self.deadline = self.origin + 25 * SECOND

    def start(self):
        gst = self.gst
        sender = gst.parse_launch(
            f"ximagesrc name=capture display-name=:{self.scene.number} use-damage=false show-pointer=false "
            '! capsfilter name=cadence caps-change-mode=immediate caps="video/x-raw,width=640,height=480,framerate=30/1" '
            "! videoconvert ! video/x-raw,format=I420 ! identity name=captured signal-handoffs=false "
            "! vp8enc name=encoder deadline=1 cpu-used=8 threads=2 end-usage=cbr target-bitrate=1000000 "
            "min-quantizer=4 max-quantizer=56 keyframe-max-dist=30 ! rtpvp8pay pt=96 "
            "! application/x-rtp,media=video,encoding-name=VP8,payload=96 "
            "! webrtcbin name=sender bundle-policy=max-bundle"
        )
        self.pipelines.append(sender)
        self.sender = sender.get_by_name("sender")
        self.receiver = _BrowserEndpoint(self.channel)
        self.control = sender.get_by_name("cadence")
        self.capture = sender.get_by_name("capture")
        self.encoder = sender.get_by_name("encoder")
        self.captured = sender.get_by_name("captured")
        self.sender.connect("on-ice-candidate", self._ice, self.receiver)
        if sender.set_state(gst.State.PLAYING) == gst.StateChangeReturn.FAILURE:
            raise ValueError("game sender start failed")
        offer = self._promise(self.sender, "create-offer", None)
        self._promise(self.sender, "set-local-description", offer)
        self.channel.send({"type": "offer", "sdp": offer.sdp.as_text()})
        until = self.now() + 8 * SECOND
        while self.now() < until:
            self.pump()
            if self.connected() and self.progress.healthy(self.now()):
                return
            time.sleep(0.005)
        raise ValueError("browser receiver startup failed")

    def connected(self):
        known_quality = bool(self.browser_stats) and bool(self.visual_samples)
        if known_quality:
            values = self.browser_stats[-1]["values"]
            known_quality = (
                values["framesDropped"] == 0
                and values["freezeCount"] == 0
                and values["frameWidth"] == 640
                and values["frameHeight"] == 480
                and self.visual_samples[-1]["color_bins"] >= 4
                and self.now() - self.origin - self.browser_stats[-1]["worker_at_ns"]
                <= 500000000
            )
        return (
            known_quality
            and self.browser_state == "connected"
            and (self.sender.get_property("connection-state").value_nick == "connected")
        )

    def pump(self):
        try:
            self._pump()
        except Exception:
            self.failed.set()
            raise

    def _pump(self):
        if self.closed or self.failed.is_set() or self.now() >= self.deadline:
            raise ValueError("game/browser worker unavailable")
        self.scene.tick()
        context = self.glib.MainContext.default()
        for _ in range(16):
            if not context.pending():
                break
            context.iteration(False)
        for _ in range(128):
            if self.events.empty():
                break
            peer, index, candidate = self.events.get_nowait()
            peer.emit("add-ice-candidate", index, candidate)
        if (
            self.pipelines[0]
            .get_bus()
            .pop_filtered(self.gst.MessageType.ERROR | self.gst.MessageType.EOS)
        ):
            raise ValueError("game source error or eos")
        for item in self.channel.read():
            kind = item["type"]
            if kind == "answer":
                if self.answered:
                    raise ValueError("browser peer replacement not permitted")
                result, description = self.sdp.SDPMessage.new_from_text(item["sdp"])
                if result != self.sdp.SDPResult.OK:
                    raise ValueError("browser description unavailable")
                description = self.rtc.WebRTCSessionDescription.new(
                    self.rtc.WebRTCSDPType.ANSWER, description
                )
                self._promise(self.sender, "set-remote-description", description)
                self.answered = True
                for index, candidate in self.pending_ice:
                    self.sender.emit("add-ice-candidate", index, candidate)
                self.pending_ice.clear()
            elif kind == "ice":
                if not self.answered:
                    if len(self.pending_ice) >= 32:
                        raise ValueError("browser candidate limit")
                    self.pending_ice.append((item["index"], item["candidate"]))
                else:
                    self.sender.emit(
                        "add-ice-candidate", item["index"], item["candidate"]
                    )
            elif kind == "health":
                self.browser_state = item["state"]
            elif kind == "frame":
                if self.browser_frames and (
                    item["browser_at_ns"] < self.browser_frames[-1]["browser_at_ns"]
                    or item["presented_frames"]
                    <= self.browser_frames[-1]["presented_frames"]
                ):
                    raise ValueError("browser presentation lifetime changed")
                self.progress.observe(item["pts_ns"], self.now())
                self.browser_frames.append(
                    item | {"worker_at_ns": self.now() - self.origin}
                )
            elif kind in ("stats", "visual"):
                destination = (
                    self.browser_stats if kind == "stats" else self.visual_samples
                )
                if len(destination) >= 128:
                    raise ValueError("browser sample limit")
                destination.append(item | {"worker_at_ns": self.now() - self.origin})

    def snapshot(self):
        result = super().snapshot()
        read_start = self.now() - self.origin
        cpu = time.process_time_ns()
        game = self.scene.resources()
        self.resources.append(
            {
                "at_ns": self.observations[-1]["at_ns"],
                "read_start_ns": read_start,
                "read_end_ns": self.now() - self.origin,
                "worker_cpu_ns": cpu,
                "game": game,
            }
        )
        return result


class _DedicatedGameBrowserPort(GameBrowserPort):
    dedicated_process = True


def assess(port):
    if port.receipts:
        during = [
            o
            for o in port.observations
            if o["configured_fps"] == o["negotiated_fps"] == 24
            and o["at_ns"] >= port.receipts[0]["after_ns"] + POLICY.settling_ns
        ]
        if len(during) >= 2:
            port.windows["during"] = {"start": during[0], "end": during[-1]}
    checks = {}
    for phase, fps in (
        ("baseline", 30),
        ("during", 24 if port.receipts else 30),
        ("restoration", 30),
    ):
        window = port.windows.get(phase)
        for counter in ("capture_buffers", "receiver_frames"):
            checks[phase + "_" + counter] = bool(window) and rate_met(
                window["end"][counter] - window["start"][counter],
                window["end"]["at_ns"] - window["start"]["at_ns"],
                fps,
            )
    checks["presentation_continuity"] = (
        port.progress.healthy(port.now())
        and bool(port.observations)
        and all(o["healthy"] for o in port.observations)
    )
    measured_visuals = [
        sample
        for sample in port.visual_samples
        if any(
            window["start"]["at_ns"] <= sample["worker_at_ns"] <= window["end"]["at_ns"]
            for window in port.windows.values()
        )
    ]
    checks["nonblank_moving_scene"] = (
        len({sample["hash"] for sample in measured_visuals}) >= 3
        and all(sample["color_bins"] >= 4 for sample in measured_visuals)
        and all(
            any(
                window["start"]["at_ns"]
                <= sample["worker_at_ns"]
                <= window["end"]["at_ns"]
                for sample in measured_visuals
            )
            for window in port.windows.values()
        )
    )
    return {"status": "met" if all(checks.values()) else "not_met", "checks": checks}


def main():
    if (
        len(sys.argv) != 5
        or sys.argv[1] != "--isolated-game-browser"
        or sys.argv[2] not in ("changed", "sham", "cancel", "disconnect")
        or sys.argv[3] != "--state-directory"
    ):
        print(
            "error: explicit isolated game/browser experiment required", file=sys.stderr
        )
        return 2
    scene, port, channel = GameScene(), None, Channel()
    cancelled = False

    def cancel(*_):
        nonlocal cancelled
        cancelled = True

    signal.signal(signal.SIGINT, cancel)
    signal.signal(signal.SIGTERM, cancel)
    report = {
        "trial_version": "n10-isolated-game-browser-v1",
        "mode": sys.argv[2],
        "live_authority": False,
        "workload": "frozen_bubble_level_1_scripted_arrows",
        "dimensions": [640, 480],
        "receiver_scope": "dedicated_headless_chromium_video",
        "perceptual_quality": "not_evaluated",
        "diagnostic_value": "unverified",
        "status": "unavailable",
        "teardown": "unknown",
        "protocol": {
            "prior_fps": 30,
            "target_fps": 24,
            "duration_ns": 3 * SECOND,
            "settling_ns": 500000000,
            "maximum_pts_gap_ns": 250000000,
            "maximum_worker_pull_gap_ns": 500000000,
            "rate_tolerance_percent": 10,
            "maximum_game_inputs": 64,
            "maximum_browser_frames_dropped": 0,
            "maximum_browser_freeze_count": 0,
            "minimum_visual_color_bins": 4,
            "warmup_ns": 3 * SECOND,
            "baseline_measure_ns": SECOND,
            "restoration_measure_ns": 750000000,
            "restoration_settling_ns": 200000000,
            "visual_sample_period_ns": 500000000,
            "browser_stats_period_ns": 200000000,
        },
    }
    unresolved = False
    try:
        scene.start()  # XInitThreads precedes Gst/native media threads.
        import gi

        gi.require_version("Gst", "1.0")
        gi.require_version("GstSdp", "1.0")
        gi.require_version("GstWebRTC", "1.0")
        from gi.repository import GLib, Gst, GstSdp, GstWebRTC

        Gst.init(None)
        port = _DedicatedGameBrowserPort(Gst, GLib, GstSdp, GstWebRTC, scene, channel)
        port.start()
        port.sleep(3)
        port.measure("baseline", SECOND)
        if sys.argv[2] == "sham":
            port.sleep(0.5)
            port.measure("during", 2 * SECOND)
            port.sleep(0.2)
            port.measure("restoration", 750000000)
        else:
            prior = port.snapshot()
            started = port.now()

            disconnect_sent = False

            def stop():
                nonlocal disconnect_sent
                if (
                    sys.argv[2] == "disconnect"
                    and not disconnect_sent
                    and port.now() - started >= SECOND
                ):
                    disconnect_sent = True
                    channel.send({"type": "disconnect"})
                return cancelled or (
                    sys.argv[2] == "cancel" and port.now() - started >= SECOND
                )

            with CadenceController(
                sys.argv[4], POLICY, port, enabled=True, sleep=port.sleep
            ) as controller:
                result = controller.execute(
                    Request("game-browser", prior.generation, 24, 3 * SECOND),
                    cancelled=stop,
                )
                report["result"] = asdict(result)
                report["journal_state"] = controller.store.journal["state"]
                unresolved = result.restoration != "verified_by_port"
                if unresolved:
                    raise ValueError("game/browser restoration unavailable")
        report["status"] = "observed"
    except (Exception, KeyboardInterrupt):  # noqa: BLE001 -- retain partial facts; teardown is mandatory
        report["status"] = "unavailable"
    finally:
        if port is not None:
            report.update(
                generation=asdict(port.generation),
                receipts=port.receipts,
                observations=port.observations,
                assessment=assess(port),
                windows=port.windows,
                receiver_timeline=port.browser_frames,
                browser_stats=port.browser_stats,
                visual_samples=port.visual_samples,
                resource_samples=port.resources,
                resource_clock_ticks_per_second=os.sysconf("SC_CLK_TCK"),
                game_inputs=scene.sent,
            )
            try:
                report["teardown"] = "null_observed" if port.close() else "unknown"
            except Exception:  # noqa: BLE001 -- native cleanup remains explicitly unknown
                report["teardown"] = "unknown"
        try:
            report["scene_cleanup"] = "reaped" if scene.close() else "unknown"
        except Exception:  # noqa: BLE001 -- keep cleanup failure visible
            report["scene_cleanup"] = "unknown"
        if report["teardown"] != "null_observed" or report["scene_cleanup"] != "reaped":
            report["status"] = "unavailable"
    channel.send({"type": "report", "data": report})
    if unresolved:
        while True:
            time.sleep(0.1)  # Independent watchdog tears down this exact worker.
    return 0 if report["status"] == "observed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
