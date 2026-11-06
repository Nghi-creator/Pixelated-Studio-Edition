"""Explicit engineering-only observer timing; measurements and timing guards unchanged."""

from .contained_condition import ResourceConditionObservation

METHOD = "n11-resource-observer-timing-diagnostic-v1"
MAX_EVENTS = 4
MAX_MARKS = 24


class ResourceTimingObservation(ResourceConditionObservation):
    """Trace first two measured references in healthy/post, with deferred emission.

    Nested call spans include scheduling time and must not be summed as disjoint
    CPU costs. This locates a delay in the source call path, not its OS cause.
    No original event timestamp, sampler value, source guard or deadline changes.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._timing_trace = None
        self._timing_counts = {"healthy": 0, "post": 0}
        self._timing_events = 0
        original_factory = self._resource_factory

        def construct(**options):
            sampler = self._timed(
                "sampler_construct", lambda: original_factory(**options)
            )
            return _TimedSampler(self, sampler)

        self._resource_factory = construct

    def _timed(self, name, callback):
        trace = self._timing_trace
        if trace is None:
            return callback()
        if len(trace["spans"]) >= MAX_MARKS:
            raise ValueError("resource timing diagnostic span budget")
        span = {"component": name, "start_ns": self.now() - self.origin, "end_ns": None}
        trace["spans"].append(span)
        try:
            return callback()
        finally:
            span["end_ns"] = self.now() - self.origin

    def reference(self, now):
        phase = self.pacing_stage
        if phase not in self._timing_counts or self._timing_counts[phase] >= 2:
            return super().reference(now)
        trace = {
            "method": METHOD,
            "phase": phase,
            "observer_tick_ns": now - self.origin,
            "reference_entry_ns": self.now() - self.origin,
            "spans": [],
        }
        self._timing_trace = trace
        try:
            return super().reference(now)
        finally:
            self._timing_trace = None
            trace["reference_exit_ns"] = self.now() - self.origin
            sample = trace.pop("sample", None)
            if sample is not None:
                if self._timing_events >= MAX_EVENTS:
                    raise ValueError("resource timing diagnostic event budget")
                trace.update(
                    resource_sample_sequence=sample["sequence"],
                    resource_clock_id=sample["clock_id"],
                    resource_read_start_ns=sample["read_start_ns"],
                    resource_read_end_ns=sample["read_end_ns"],
                    scope="engineering_call_path_elapsed_not_cpu_time_or_causal_attribution",
                    live_authority=False,
                )
                self._timing_counts[phase] += 1
                self._timing_events += 1
                self.emit("n11_observer_timing", **trace)

    def slots(self, *args, **kwargs):
        return self._timed(
            "slots",
            lambda: super(ResourceTimingObservation, self).slots(*args, **kwargs),
        )

    def target_ready(self, *args, **kwargs):
        return self._timed(
            "target_ready",
            lambda: super(ResourceTimingObservation, self).target_ready(
                *args, **kwargs
            ),
        )

    def ready(self, *args, **kwargs):
        return self._timed(
            "ready",
            lambda: super(ResourceTimingObservation, self).ready(*args, **kwargs),
        )

    def identity(self, *args, **kwargs):
        return self._timed(
            "identity",
            lambda: super(ResourceTimingObservation, self).identity(*args, **kwargs),
        )

    def _resource_emit(self, kind, **fields):
        if kind == "n11_resource_context":
            return self._timed(
                "context_emit",
                lambda: super(ResourceTimingObservation, self)._resource_emit(
                    kind, **fields
                ),
            )
        return super()._resource_emit(kind, **fields)

    def native_read_evidence(self, slot, observation):
        result = self._timed(
            "native_and_resource_metadata",
            lambda: super(ResourceTimingObservation, self).native_read_evidence(
                slot, observation
            ),
        )
        if self._timing_trace is not None:
            self._timing_trace["sample"] = result["container_cpu_read"]
        return result

    def reference_witness(self, slot):
        return self._timed(
            "ownership_witness",
            lambda: super(ResourceTimingObservation, self).reference_witness(slot),
        )


class _TimedSampler:
    def __init__(self, observer, sampler):
        self.observer, self.sampler = observer, sampler

    def sample(self):
        return self.observer._timed("sampler_read", self.sampler.sample)
