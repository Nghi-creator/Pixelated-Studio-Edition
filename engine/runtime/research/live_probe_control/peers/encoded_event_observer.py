"""Bounded encoded-pad observations for isolated engineering qualification."""

from time import monotonic_ns

MAX_EVENTS = 1024


class EncodedEventObserver:
    """One observer per pad lifetime, installed before the first buffer."""

    def __init__(self, *, origin_ns, clock_id, now=monotonic_ns):
        self._origin_ns = origin_ns
        self._clock_id = clock_id
        self._now = now
        self._rows = []
        self._observed = 0
        self._unsupported = False

    def attach(self, pad, gst):
        """Install before playback. Export after streaming has quiesced and before the identity resets."""
        return pad.add_probe(
            gst.PadProbeType.BUFFER | gst.PadProbeType.BUFFER_LIST, self._observe, gst
        )

    def _observe(self, _pad, info, gst):
        start = self._now() - self._origin_ns
        if info.type & gst.PadProbeType.BUFFER_LIST:
            self._unsupported = True
            return gst.PadProbeReturn.OK
        ordinal = self._observed + 1
        if ordinal <= MAX_EVENTS:
            end = self._now() - self._origin_ns
            self._rows.append((ordinal, start, end))
        self._observed = ordinal
        return gst.PadProbeReturn.OK

    def snapshot(self, read_identity_count, *, time_namespace):
        """Bracket an aggregate read and copy the prefix on the slow path."""
        before = self._observed
        start = self._now() - self._origin_ns
        identity_count = read_identity_count()
        end = self._now() - self._origin_ns
        after = self._observed
        observed = self._observed
        rows = self._rows[: min(observed, MAX_EVENTS)]
        return {
            "origin_ns": self._origin_ns,
            "time_namespace": time_namespace,
            "identity_read": {
                "start_ns": start,
                "end_ns": end,
                "count": identity_count,
                "observed_before": before,
                "observed_after": after,
            },
            "observed": observed,
            "buffer_list": self._unsupported,
            "rows": [list(row) for row in rows],
        }

    def export(self, *, identity_count):
        """Reconcile the full lifetime with the quiescent identity's aggregate count."""
        reasons = []
        if self._observed > MAX_EVENTS:
            reasons.append("event_capacity_exceeded")
        if self._unsupported:
            reasons.append("unsupported_buffer_list")
        if type(identity_count) is not int or identity_count != self._observed:
            reasons.append("identity_count_mismatch")
        if not self._rows:
            reasons.append("no_encoded_events")
        return {
            "state": "unavailable" if reasons else "count_reconciled",
            "reason_codes": reasons,
            "identity_count": identity_count,
            "observed_callbacks": self._observed,
            "clock_id": self._clock_id,
            "events": [
                {
                    "clock_id": self._clock_id,
                    "event_ordinal": ordinal,
                    "read_start_ns": start,
                    "read_end_ns": end,
                }
                for ordinal, start, end in self._rows
            ],
        }
