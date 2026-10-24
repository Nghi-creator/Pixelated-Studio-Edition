"""Explicit synthetic VP8 experiment; never attaches to a camera or qualifies relief."""

import json
import platform
import signal
import sys
import time

PIPELINE = (
    "videotestsrc is-live=true pattern=smpte num-buffers=600 "
    "! video/x-raw,format=I420,width=640,height=360,framerate=30/1 "
    "! vp8enc name=encoder deadline=1 cpu-used=8 threads=4 end-usage=cbr "
    "target-bitrate=1000000 min-quantizer=4 max-quantizer=56 keyframe-max-dist=120 "
    "! identity name=encoded signal-handoffs=false "
    "! vp8dec ! fakesink name=decoded sync=false signal-handoffs=false"
)
UNRELATED = (
    "cpu-used",
    "threads",
    "end-usage",
    "min-quantizer",
    "max-quantizer",
    "deadline",
    "keyframe-max-dist",
)


def counter(value):
    if type(value) is not int or not 0 <= value <= 2**53 - 1:
        raise ValueError("invalid_counter")
    return value


def snapshot(pipeline, gst, now=time.monotonic_ns):
    before = now()
    result, current, pending = pipeline.get_state(0)
    if (
        result == gst.StateChangeReturn.FAILURE
        or current != gst.State.PLAYING
        or pending != gst.State.VOID_PENDING
    ):
        raise ValueError("not_stable_playing")
    encoder = pipeline.get_by_name("encoder")
    encoded = pipeline.get_by_name("encoded").get_property("stats")
    decoded = pipeline.get_by_name("decoded").get_property("stats")
    row = dict(
        read_start_ns=counter(before),
        setting=counter(encoder.get_property("target-bitrate")),
        encoded_bytes=counter(encoded.get_value("num-bytes")),
        encoded_buffers=counter(encoded.get_value("num-buffers")),
        decoded_frames=counter(decoded.get_value("rendered")),
        decoded_dropped=counter(decoded.get_value("dropped")),
        unrelated={key: int(encoder.get_property(key)) for key in UNRELATED},
    )
    row["read_end_ns"] = counter(now())
    if row["read_end_ns"] < row["read_start_ns"]:
        raise ValueError("clock_order")
    return row


def window(start, end):
    if end["read_start_ns"] <= start["read_end_ns"]:
        raise ValueError("clock_order")
    result = dict(start=start, end=end)
    for key in ("encoded_bytes", "encoded_buffers", "decoded_frames", "decoded_dropped"):
        delta = end[key] - start[key]
        if delta < 0:
            raise ValueError("counter_reset")
        result[key] = delta
    duration = end["read_start_ns"] - start["read_start_ns"]
    result["observed_bit_per_second"] = result["encoded_bytes"] * 8 * 10**9 / duration
    return result


def wait(bus, gst, seconds, deadline, now=time.monotonic):
    until = now() + seconds
    while now() < until:
        if now() >= deadline:
            raise ValueError("trial_deadline")
        message = bus.timed_pop_filtered(
            50 * gst.MSECOND, gst.MessageType.ERROR | gst.MessageType.EOS
        )
        if message is not None:
            # Never serialize plugin exception/debug strings or native paths.
            raise ValueError("pipeline_error_or_eos")


def run(gst, now=time.monotonic_ns):
    origin = now()

    def elapsed():
        return counter(now() - origin)

    report = dict(
        trial_version="n10-isolated-vp8-trial-v1",
        python_version=platform.python_version(),
        architecture=platform.machine(),
        platform=sys.platform,
        scope="owned_synthetic_encode_decode_only",
        live_authority=False,
        selected_family=None,
        live_relief="unavailable_unverified",
        receiver_continuity="not_tested_no_webrtc_receiver",
        output_effect="not_qualified_by_this_trial",
        clock="process_monotonic_ns_relative_to_trial_origin",
        protocol=dict(
            startup_seconds=2, settling_seconds=1, measurement_seconds=2, deadline_seconds=18
        ),
        status="unavailable",
        reason="pipeline_setup_failed",
        restoration="not_attempted",
        teardown="not_created",
        windows={},
        receipts=[],
    )
    pipeline = encoder = None
    baseline = None
    mutation_attempted = False
    try:
        gst.init(None)
        report["gst_version"] = ".".join(map(str, gst.version()[:3]))
        pipeline = gst.parse_launch(PIPELINE)
        report["teardown"] = "unknown"
        encoder = pipeline.get_by_name("encoder")
        baseline = counter(encoder.get_property("target-bitrate"))
        if baseline != 1000000:
            raise ValueError("unexpected_initial_setting")
        deadline = time.monotonic() + 18
        bus = pipeline.get_bus()
        report["reason"] = "pipeline_start_failed"
        if pipeline.set_state(gst.State.PLAYING) == gst.StateChangeReturn.FAILURE:
            raise ValueError("pipeline_start_failed")
        wait(bus, gst, 2, deadline)
        for phase, value in (("baseline", baseline), ("during", 500000), ("restoration", baseline)):
            if phase != "baseline":
                report["reason"] = "setting_application_failed"
                # Record intent before invoking a setter that may partly apply then raise.
                receipt = dict(phase=phase, requested=value, before_ns=elapsed(), after_ns=None)
                report["receipts"].append(receipt)
                mutation_attempted = True
                encoder.set_property("target-bitrate", value)
                receipt["after_ns"] = elapsed()
            wait(bus, gst, 1, deadline)  # Predeclared settling exclusion.
            report["reason"] = "observation_failed"
            start = snapshot(pipeline, gst, elapsed)
            wait(bus, gst, 2, deadline)
            end = snapshot(pipeline, gst, elapsed)
            report["windows"][phase] = window(start, end)
            if start["setting"] != value or end["setting"] != value:
                raise ValueError("setting_readback_mismatch")
            if start["unrelated"] != end["unrelated"]:
                raise ValueError("unrelated_setting_changed")
            if (
                phase != "baseline"
                and start["unrelated"] != report["windows"]["baseline"]["start"]["unrelated"]
            ):
                raise ValueError("unrelated_setting_changed")
            if report["windows"][phase]["decoded_frames"] == 0:
                raise ValueError("no_decoded_progress")
        report.update(
            status="observed", reason=None, restoration="setting_and_local_decode_observed"
        )
    except (Exception, KeyboardInterrupt):
        # Keep partial receipts/windows. No successful setter is inferred from an exception.
        report["status"] = "unavailable"
    finally:
        if mutation_attempted and encoder is not None:
            try:
                # Only ever touches this process's throwaway encoder, never a live peer.
                receipt = dict(
                    phase="cleanup", requested=baseline, before_ns=elapsed(), after_ns=None
                )
                report["receipts"].append(receipt)
                encoder.set_property("target-bitrate", baseline)
                receipt["after_ns"] = elapsed()
                if encoder.get_property("target-bitrate") != baseline:
                    raise ValueError("restore_readback_failed")
                if report["restoration"] == "not_attempted":
                    report["restoration"] = "setting_only_no_restoration_window"
            except Exception:
                report.update(status="unavailable", reason="restore_failed", restoration="unknown")
        if pipeline is not None:
            try:
                result = pipeline.set_state(gst.State.NULL)
                _change, current, pending = pipeline.get_state(gst.SECOND)
                if (
                    result == gst.StateChangeReturn.FAILURE
                    or current != gst.State.NULL
                    or pending != gst.State.VOID_PENDING
                ):
                    raise ValueError("teardown_failed")
                report["teardown"] = "null_observed"
            except Exception:
                report.update(status="unavailable", reason="teardown_failed", teardown="unknown")
    return report


def main():
    if sys.argv[1:] != ["--isolated-bitrate-trial"]:
        print("error: requires --isolated-bitrate-trial", file=sys.stderr)
        return 2

    # Termination takes the same cleanup path as Ctrl-C. SIGKILL destroys only the
    # isolated process; the external timeout must remove its throwaway container.
    def terminate(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, terminate)
    try:
        import gi

        gi.require_version("Gst", "1.0")
        from gi.repository import Gst
    except (ImportError, ValueError):
        print(
            json.dumps(
                dict(status="unavailable", reason="gstreamer_unavailable", live_authority=False)
            )
        )
        return 1
    report = run(Gst)
    print(json.dumps(report, indent=2, sort_keys=True, allow_nan=False))
    return 0 if report["status"] == "observed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
