"""Owned synthetic/Xvfb capture-cadence experiment; no live gameplay attachment."""

import ctypes
import json
import os
import select
import signal
import subprocess
import sys
import time
from contextlib import nullcontext

from live_probe_trial import counter, snapshot, window

CAPS = {fps: f"video/x-raw,width=640,height=360,framerate={fps}/1" for fps in (15, 30)}
SOURCES = {
    "synthetic": "videotestsrc name=capture is-live=true pattern=ball num-buffers=900",
    "x11": (
        "ximagesrc name=capture display-name=:88 use-damage=false "
        "show-pointer=false num-buffers=900"
    ),
}
TAIL = (
    ' ! capsfilter name=cadence caps-change-mode=immediate caps="' + CAPS[30] + '"'
    " ! identity name=captured signal-handoffs=false"
    " ! videoconvert ! video/x-raw,format=I420"
    " ! vp8enc name=encoder deadline=1 cpu-used=8 threads=4 end-usage=cbr"
    " target-bitrate=1000000 min-quantizer=4 max-quantizer=56 keyframe-max-dist=120"
    " ! identity name=encoded signal-handoffs=false ! vp8dec"
    " ! appsink name=decoded sync=false emit-signals=false max-buffers=60 drop=false"
)
PROTOCOL = dict(
    startup_seconds=2,
    settling_seconds=2,
    measurement_seconds=4,
    deadline_seconds=25,
    maximum_pts_gap_ns=250000000,
    maximum_pull_gap_ns=500000000,
)


def cadence_snapshot(pipeline, gst, elapsed):
    row = snapshot(pipeline, gst, elapsed)
    row["capture_buffers"] = counter(
        pipeline.get_by_name("captured").get_property("stats").get_value("num-buffers")
    )
    negotiated = pipeline.get_by_name("capture").get_static_pad("src").get_current_caps()
    configured = pipeline.get_by_name("cadence").get_property("caps")
    for name, caps in (("negotiated", negotiated), ("configured", configured)):
        if caps is None or caps.get_size() != 1:
            raise ValueError("caps_unavailable")
        structure = caps.get_structure(0)
        with structure if hasattr(structure, "__enter__") else nullcontext(structure) as fields:
            ok, numerator, denominator = fields.get_fraction("framerate")
            if not ok or denominator != 1 or numerator not in CAPS:
                raise ValueError("unexpected_framerate")
            if fields.get_value("width") != 640 or fields.get_value("height") != 360:
                raise ValueError("unexpected_dimensions")
            row[name + "_fps"] = numerator
    row["read_end_ns"] = elapsed()
    return row


def collect(pipeline, gst, seconds, deadline, timeline, elapsed):
    until = time.monotonic() + seconds
    bus = pipeline.get_bus()
    sink = pipeline.get_by_name("decoded")
    while time.monotonic() < until:
        if time.monotonic() >= deadline:
            raise ValueError("trial_deadline")
        if bus.timed_pop_filtered(50 * gst.MSECOND, gst.MessageType.ERROR | gst.MessageType.EOS):
            raise ValueError("pipeline_error_or_eos")
        # Pull outside media callbacks; fixed work and queue bounds prevent an
        # unbounded drain or per-frame callback/control integration.
        for _ in range(8):
            sample = sink.emit("try-pull-sample", 0)
            if sample is None:
                break
            pts = sample.get_buffer().pts
            if pts == gst.CLOCK_TIME_NONE or len(timeline) >= 1200:
                raise ValueError("pts_unavailable_or_limit")
            timeline.append(dict(pts_ns=counter(pts), observed_at_ns=elapsed()))


def assess(windows, timeline, sham):
    checks = {}
    for phase in ("baseline", "during", "restoration"):
        row = windows[phase]
        target = 15 if phase == "during" and not sham else 30
        duration = row["end"]["read_start_ns"] - row["start"]["read_start_ns"]
        for name in ("capture_buffers", "encoded_buffers", "decoded_frames"):
            # Inclusive +/-10% of requested cadence using integer cross-products.
            count = row[name]
            checks[phase + "_" + name] = (
                9 * target * duration <= 10 * count * 10**9 <= 11 * target * duration
            )
    differences = [b["pts_ns"] - a["pts_ns"] for a, b in zip(timeline, timeline[1:], strict=False)]
    checks["decoded_pts_continuity"] = bool(differences) and all(
        0 < delta <= PROTOCOL["maximum_pts_gap_ns"] for delta in differences
    )
    pulls = [
        b["observed_at_ns"] - a["observed_at_ns"]
        for a, b in zip(timeline, timeline[1:], strict=False)
    ]
    checks["decoded_pull_continuity"] = bool(pulls) and all(
        0 <= delta <= PROTOCOL["maximum_pull_gap_ns"] for delta in pulls
    )
    return dict(
        status="met" if all(checks.values()) else "not_met",
        checks=checks,
        maximum_observed_pts_gap_ns=max((x for x in differences if x > 0), default=None),
        maximum_observed_pull_gap_ns=max(pulls) if pulls else None,
    )


def run(gst, source="synthetic", sham=False, owned_display=None, now=time.monotonic_ns):
    if source not in SOURCES or type(sham) is not bool:
        raise ValueError("unsupported_protocol")
    if source == "x11" and (type(owned_display) is not int or not 0 <= owned_display <= 65535):
        raise ValueError("owned_display_required")
    origin = now()

    def elapsed():
        return counter(now() - origin)

    report = dict(
        trial_version="n10-isolated-capture-cadence-v1",
        source=source,
        sham=sham,
        scope="owned_disposable_pipeline_only",
        live_authority=False,
        selected_family=None,
        live_relief="unavailable_unverified",
        receiver_continuity="not_tested_no_webrtc_receiver",
        protocol=PROTOCOL.copy(),
        clock_basis="process_monotonic_relative_ns",
        pts_basis="same_pipeline_buffer_pts_not_browser_aligned",
        status="unavailable",
        reason="setup_failed",
        restoration="not_attempted",
        teardown="not_created",
        windows={},
        receipts=[],
        decoded_timeline=[],
        assessment=dict(status="unavailable", checks={}),
    )
    pipeline = control = None
    attempted = False
    try:
        gst.init(None)
        report["gst_version"] = ".".join(map(str, gst.version()[:3]))
        text = SOURCES[source] + TAIL
        if source == "x11":
            text = text.replace("display-name=:88", f"display-name=:{owned_display}")
        pipeline = gst.parse_launch(text)
        report["teardown"] = "unknown"
        control = pipeline.get_by_name("cadence")
        deadline = time.monotonic() + PROTOCOL["deadline_seconds"]
        if pipeline.set_state(gst.State.PLAYING) == gst.StateChangeReturn.FAILURE:
            raise ValueError("start_failed")
        timeline = report["decoded_timeline"]
        collect(pipeline, gst, PROTOCOL["startup_seconds"], deadline, timeline, elapsed)
        for phase, fps in (("baseline", 30), ("during", 30 if sham else 15), ("restoration", 30)):
            if phase != "baseline":
                report["reason"] = "apply_failed"
                receipt = dict(phase=phase, requested_fps=fps, before_ns=elapsed(), after_ns=None)
                report["receipts"].append(receipt)
                attempted = True
                control.set_property("caps", gst.Caps.from_string(CAPS[fps]))
                receipt["after_ns"] = elapsed()
            report["reason"] = "observation_failed"
            collect(pipeline, gst, PROTOCOL["settling_seconds"], deadline, timeline, elapsed)
            start = cadence_snapshot(pipeline, gst, elapsed)
            collect(pipeline, gst, PROTOCOL["measurement_seconds"], deadline, timeline, elapsed)
            end = cadence_snapshot(pipeline, gst, elapsed)
            report["windows"][phase] = dict(
                start=start, end=end, status="unavailable", reason="counter_delta_failed"
            )
            row = window(start, end)
            row.update(status="observed", reason=None)
            row["capture_buffers"] = end["capture_buffers"] - start["capture_buffers"]
            if row["capture_buffers"] < 0:
                raise ValueError("capture_counter_reset")
            report["windows"][phase] = row
            if any(
                value[key] != fps
                for value in (start, end)
                for key in ("configured_fps", "negotiated_fps")
            ):
                raise ValueError("caps_readback_mismatch")
            reference = report["windows"]["baseline"]["start"]
            if any(
                value["unrelated"] != reference["unrelated"] or value["setting"] != 1000000
                for value in (start, end)
            ):
                raise ValueError("unrelated_controls_changed")
        report["assessment"] = assess(report["windows"], timeline, sham)
        restored = all(
            report["assessment"]["checks"]["restoration_" + key]
            for key in ("capture_buffers", "encoded_buffers", "decoded_frames")
        )
        report.update(
            status="observed",
            reason=None,
            restoration="caps_and_local_cadence_observed"
            if restored
            else "caps_only_no_verified_cadence",
        )
    except (Exception, KeyboardInterrupt):
        # Retain partial data; never publish driver/native exception strings.
        report["status"] = "unavailable"
    finally:
        if attempted and control is not None:
            try:
                receipt = dict(
                    phase="cleanup", requested_fps=30, before_ns=elapsed(), after_ns=None
                )
                report["receipts"].append(receipt)
                control.set_property("caps", gst.Caps.from_string(CAPS[30]))
                receipt["after_ns"] = elapsed()
                if not control.get_property("caps").is_equal(gst.Caps.from_string(CAPS[30])):
                    raise ValueError("restore_failed")
                if report["restoration"] == "not_attempted":
                    report["restoration"] = "caps_only_no_restoration_window"
            except Exception:
                report.update(status="unavailable", reason="restore_failed", restoration="unknown")
        if pipeline is not None:
            try:
                result = pipeline.set_state(gst.State.NULL)
                _, state, pending = pipeline.get_state(gst.SECOND)
                if (
                    result == gst.StateChangeReturn.FAILURE
                    or state != gst.State.NULL
                    or pending != gst.State.VOID_PENDING
                ):
                    raise ValueError("teardown_failed")
                report["teardown"] = "null_observed"
            except Exception:
                report.update(status="unavailable", reason="teardown_failed", teardown="unknown")
    return report


def run_x11(gst, sham):
    """Create/own the X display and scene; never reuse an existing display."""
    display = None
    read_fd = write_fd = None
    report = dict(status="unavailable", reason="display_setup_failed", live_authority=False)
    try:
        read_fd, write_fd = os.pipe()
        display = subprocess.Popen(  # noqa: S603 -- fixed binary and bounded owned-display pipe
            [
                "/usr/bin/Xvfb",
                "-displayfd",
                str(write_fd),
                "-screen",
                "0",
                "640x360x24",
                "-nolisten",
                "tcp",
            ],
            pass_fds=(write_fd,),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        os.close(write_fd)
        write_fd = None
        ready, _, _ = select.select([read_fd], [], [], 3)
        if not ready:
            raise ValueError("display_failed")
        data = os.read(read_fd, 16)
        if not data.endswith(b"\n") or not data[:-1].isdigit() or display.poll() is not None:
            raise ValueError("display_failed")
        number = int(data[:-1])
        if not 0 <= number <= 65535:
            raise ValueError("display_failed")
        gst.init(None)
        report = run(gst, "x11", sham, owned_display=number)
    except (Exception, KeyboardInterrupt):
        report["status"] = "unavailable"
    finally:
        for descriptor in (read_fd, write_fd):
            if descriptor is not None:
                try:
                    os.close(descriptor)
                except OSError:
                    report.update(status="unavailable", reason="display_pipe_cleanup_failed")
        if display is not None:
            try:
                display.terminate()
                try:
                    display.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    display.kill()
                    display.wait(timeout=2)
                report["display_cleanup"] = "reaped"
            except Exception:
                report.update(status="unavailable", reason="display_cleanup_failed")
    return report


def main():
    choices = {
        "--isolated-cadence-trial": ("synthetic", False),
        "--isolated-cadence-sham": ("synthetic", True),
        "--isolated-x11-cadence-trial": ("x11", False),
        "--isolated-x11-cadence-sham": ("x11", True),
    }
    if len(sys.argv) != 2 or sys.argv[1] not in choices:
        print("error: requires one explicit isolated cadence protocol", file=sys.stderr)
        return 2
    source, sham = choices[sys.argv[1]]

    def terminate(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, terminate)
    try:
        # Xlib threading must initialize before Gst/plugin/scene threads exist.
        if source == "x11" and not ctypes.CDLL("libX11.so.6").XInitThreads():
            raise ValueError("xlib_init_failed")
        import gi

        gi.require_version("Gst", "1.0")
        from gi.repository import Gst

        report = run_x11(Gst, sham) if source == "x11" else run(Gst, source, sham)
    except (ImportError, ValueError, OSError):
        report = dict(status="unavailable", reason="runtime_unavailable", live_authority=False)
    print(json.dumps(report, indent=2, sort_keys=True, allow_nan=False))
    return 0 if report["status"] == "observed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
