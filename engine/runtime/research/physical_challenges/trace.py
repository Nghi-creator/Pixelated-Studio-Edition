"""Reuse encoded trace reconstruction with separately named challenge references."""

from research.resource_observation.encoded_phase_trace import EncodedPhaseTrace


class ChallengeEncodedPhaseTrace(EncodedPhaseTrace):
    def observe(self, kind, **fields):
        if kind == "n11_challenge_reference":
            rows = fields["samples"]
            self._record(fields["phase"], "start", rows[0]["at_ns"])
            self._record(fields["phase"], "end", rows[-1]["at_ns"])
            self.emit(kind, **fields)
        else:
            super().observe(kind, **fields)
