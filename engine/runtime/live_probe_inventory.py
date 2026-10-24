"""Opt-in read-only Gst metadata inventory; never imports camera or authorizes a probe."""

import json
import math
import platform
import sys

# Closed inventory, not a path for inspecting arbitrary device/string properties.
PROPERTIES = {
    "vp8enc": (
        ("target-bitrate", "bit_per_second"),
        ("cpu-used", "encoder_setting"),
        ("max-quantizer", "quantizer_index"),
        ("min-quantizer", "quantizer_index"),
        ("deadline", "microsecond"),
        ("threads", "thread_count"),
        ("keyframe-max-dist", "frame_count"),
    ),
    "videorate": (("max-rate", "frame_per_second"), ("drop-only", "boolean")),
    "identity": (("sleep-time", "microsecond"),),
}
STATES = {"null", "ready", "paused", "playing", "void-pending"}


def _scalar(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and -(2**63) <= value < 2**64:
        return int(value)
    if isinstance(value, float) and math.isfinite(value):
        return value
    raise ValueError("unsupported property value")


def _state(element, gst):
    result, state, pending = element.get_state(0)
    if result == gst.StateChangeReturn.FAILURE:
        raise ValueError("state read failed")
    values = (state.value_nick, pending.value_nick)
    if any(value not in STATES for value in values):
        raise ValueError("unknown state")
    return dict(current=values[0], pending=values[1])


def property_snapshot(element, name, unit, gst, gobject):
    """Read one whitelisted property; setting readback is not an independent effect."""
    if not any((name, unit) in properties for properties in PROPERTIES.values()):
        raise ValueError("unsupported inventory property")
    row = dict(property=name, unit=unit, status="unavailable", reason="property_missing")
    try:
        spec = element.find_property(name)
        if spec is None:
            return row
        row["reason"] = "property_metadata_unreadable"
        flags = int(spec.flags)
        row.update(
            flags=flags,
            readable=bool(flags & int(gobject.ParamFlags.READABLE)),
            writable=bool(flags & int(gobject.ParamFlags.WRITABLE)),
            construct_only=bool(flags & int(gobject.ParamFlags.CONSTRUCT_ONLY)),
            declared_mutable_playing=bool(flags & int(gst.PARAM_MUTABLE_PLAYING)),
        )
        row["reason"] = "property_metadata_unreadable"
        # Bounds/defaults are metadata, never a proposed probe intensity.
        for field in ("minimum", "maximum", "default_value"):
            if hasattr(spec, field):
                row[field] = _scalar(getattr(spec, field))
        if not row["readable"]:
            row["reason"] = "property_not_readable"
            return row
        row["reason"] = "property_read_failed"
        row["value"] = _scalar(element.get_property(name))
        row.update(status="observed", reason=None)
    except Exception:
        # GI/driver exceptions must not expose native identities, paths or messages.
        return row
    return row


def element_snapshot(element, expected_factory, gst, gobject):
    """Bounded snapshot, with state changes visible; no setter or state transition."""
    if expected_factory not in PROPERTIES:
        raise ValueError("unsupported inventory factory")
    report = dict(
        factory=expected_factory, status="unavailable", reason="element_missing", properties=[]
    )
    if element is None:
        return report
    try:
        report["reason"] = "factory_unavailable"
        factory = element.get_factory()
        if factory is None or factory.get_name() != expected_factory:
            report["reason"] = "factory_mismatch"
            return report
        report["reason"] = "state_unavailable"
        before = _state(element, gst)
        report["state"] = before
        report["properties"] = [
            property_snapshot(element, name, unit, gst, gobject)
            for name, unit in PROPERTIES[expected_factory]
        ]
        after = _state(element, gst)
        report["state_after"] = after
        if before != after or before["pending"] != "void-pending":
            report["reason"] = "state_unstable"
            return report
        report.update(status="observed", reason=None)
    except Exception:
        return report
    return report


def inventory(gst=None, gobject=None):
    """Inspect fresh NULL elements only. Flags never establish live availability."""
    report = dict(
        inventory_version="n10-property-inventory-v1",
        scope="fresh_null_elements_only",
        live_relief="unavailable_unverified",
        selected_family=None,
        application="not_run",
        restoration="not_run",
        receiver_continuity="not_run",
        live_authority=False,
        properties_are="gobject_setting_reads_not_independent_effect_readback",
        python_version=".".join(map(str, sys.version_info[:3])),
        platform=sys.platform,
        architecture=platform.machine(),
        status="unavailable",
        reason="gstreamer_unavailable",
        elements=[],
    )
    try:
        if gst is None or gobject is None:
            import gi

            gi.require_version("Gst", "1.0")
            from gi.repository import GObject, Gst

            gst, gobject = Gst, GObject
        gst.init(None)
        report["gst_version"] = ".".join(map(str, gst.version()[:3]))
        for factory in PROPERTIES:
            try:
                element = gst.ElementFactory.make(factory, None)
                row = element_snapshot(element, factory, gst, gobject)
            except Exception:
                row = dict(
                    factory=factory,
                    status="unavailable",
                    reason="element_unavailable",
                    properties=[],
                )
            # This standalone inspector must never accept a non-NULL element as
            # an installed-plugin inventory, even if a factory/test returns one.
            if row.get("state", {}).get("current") not in (None, "null"):
                row.update(status="unavailable", reason="unexpected_element_state")
            report["elements"].append(row)
        report.update(status="observed", reason=None)
    except Exception:
        return report
    return report


def main():
    # No arbitrary property/factory, output path, pipeline or live-control argument.
    if len(sys.argv) != 1:
        print("error: inventory accepts no arguments", file=sys.stderr)
        return 2
    report = inventory()
    print(json.dumps(report, indent=2, sort_keys=True, allow_nan=False))
    return 0 if report["status"] == "observed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
