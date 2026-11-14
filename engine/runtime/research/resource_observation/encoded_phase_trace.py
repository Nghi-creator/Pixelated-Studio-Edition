"""Bind contained controller phase receipts to a reconciled worker trace."""

from dataclasses import asdict

from research.live_probe_control.control.contracts import digest
from research.live_probe_control.peers.encoded_event_observer import MAX_EVENTS
from research.live_probe_control.peers.peer_protocol import encoded_trace_value

PHASES = ("healthy", "degraded", "relief", "recovery", "post")
METHOD = "n11-contained-encoded-event-trace-v1"
REFERENCE_SPAN_NS = 3_200_000_000
SUFFIX_WAIT_NS = 100_000_000


class EncodedPhaseTrace:
    def __init__(self, emit):
        self.emit = emit
        self.boundaries = {}

    def observe(self, kind, **fields):
        if kind == "n11_pacing_reference":
            samples = fields["samples"]
            self._record(fields["phase"], "start", samples[0]["at_ns"])
            self._record(fields["phase"], "end", samples[-1]["at_ns"])
        elif kind == "n11_pair_phase_started":
            self._record(fields["phase"], "start", fields["at_ns"])
        elif kind == "n11_pair_phase_completed":
            self._record(fields["phase"], "end", fields["at_ns"])
        self.emit(kind, **fields)

    def _record(self, phase, edge, at_ns):
        key = phase, edge
        if (
            phase not in PHASES
            or key in self.boundaries
            or type(at_ns) is not int
            or at_ns < 0
        ):
            raise ValueError("invalid encoded phase boundary")
        self.boundaries[key] = at_ns

    def report(self, reply, *, generation, controller_origin_ns, controller_namespace):
        encoded_trace_value(reply)
        reasons = []
        if reply["time_namespace"] != controller_namespace:
            reasons.append("time_namespace_mismatch")
        if reply["buffer_list"]:
            reasons.append("unsupported_buffer_list")
        if reply["observed"] > MAX_EVENTS:
            reasons.append("event_capacity_exceeded")
        read = reply["identity_read"]
        count = read["count"]
        rows = reply["rows"]
        if (
            not count
            or not count == read["observed_before"] == read["observed_after"]
            or count > len(rows)
            or rows[count - 1][2] > read["start_ns"]
        ):
            reasons.append("identity_prefix_not_reconciled")
        windows = {}
        if not reasons:
            offset = controller_origin_ns - reply["origin_ns"]
            previous_end = 0
            for phase in PHASES:
                start, end = (
                    offset + self.boundaries[phase, edge] for edge in ("start", "end")
                )
                if not previous_end <= start < end <= read["start_ns"]:
                    raise ValueError("encoded phase boundary order")
                windows[phase] = {"phase_start_ns": start, "phase_end_ns": end}
                previous_end = end
        return {
            "method": METHOD,
            "state": "unavailable" if reasons else "count_reconciled",
            "reason_codes": reasons,
            "worker_clock_id": "worker-monotonic-" + digest(asdict(generation)),
            "controller_origin_ns": str(controller_origin_ns),
            "controller_time_namespace": controller_namespace,
            "controller_boundaries": [
                {"phase": p, "edge": e, "at_ns": t}
                for (p, e), t in self.boundaries.items()
            ],
            "windows": windows,
            "trace": {**reply, "origin_ns": str(reply["origin_ns"])},
            "live_authority": False,
        }
