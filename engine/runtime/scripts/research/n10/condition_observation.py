"""Common owned-condition evidence; no diagnostic truth or independence acceptance."""
from dataclasses import asdict
from condition_protocol import METHOD, condition_variant
from contained_pressure import ContainedPressure, cgroup_counters
from pacing_fixture import PacingHandle
from pacing_observation import PacingContrastObservation


class ConditionObservation(PacingContrastObservation):
    method=METHOD
    contrast=False

    def __init__(self,*args,condition):
        self.variant=condition_variant(condition)
        self.condition=condition
        super().__init__(*args)
        self.pressure=ContainedPressure()
        self.reference_handle=None
        self.condition_started=False
        self.condition_started_at=None
        self.condition_cleanup=False

    def registry(self):
        pressure=self.pressure
        if pressure.used and not pressure.closed:
            return dict(state='active',used=True,closed=False,**pressure.sample())
        if pressure.closed and pressure.used:
            if len(pressure.children)!=2 or len(pressure.records)!=2 or any(h is not None for h in pressure.handles) or any(c.poll() is None for c in pressure.children):
                raise ValueError('pressure reap evidence lost')
            return dict(state='reaped',used=True,closed=True,identities=pressure.identities(),active_workers=0,cpu_ns=None,cgroup=cgroup_counters())
        if pressure.children or pressure.handles or pressure.records or pressure.started_at is not None:
            raise ValueError('unused pressure registry changed')
        return dict(state='closed_unused' if pressure.closed else 'unused',used=False,closed=pressure.closed,
                    identities=[],active_workers=0,cpu_ns=[],cgroup=cgroup_counters())

    def witness(self,slot,handle):
        start=self.now()-self.origin
        state=handle.sample(fresh=True)
        end=self.now()-self.origin
        pressure_start=self.now()-self.origin
        pressure=self.registry()
        pressure_end=self.now()-self.origin
        return dict(method='n11-owned-condition-witness-v1',condition=self.condition,
                    generation=asdict(slot.owner.generation),property=state,
                    property_read_start_ns=start,property_read_end_ns=end,
                    pressure_read_start_ns=pressure_start,pressure_read_end_ns=pressure_end,
                    pressure=pressure,ownership_scope='owned_fixture_registry_and_identity_only')

    def reference_witness(self,slot):
        if self.reference_handle is None:
            self.reference_handle=PacingHandle(self.local,slot,condition=self.condition)
        if self.pacer is not None:
            self.reference_handle.sequence=max(self.reference_handle.sequence,self.pacer.sequence)
        return dict(condition_witness=self.witness(slot,self.reference_handle))

    def phase_boundary(self,kind,phase):
        slots=self.slots(('first',))
        if slots is None:raise ValueError('condition source lost')
        witness=self.witness(slots['first'],self.pacer)
        state=witness['property']
        if state['sleep_time_us']!=self.variant['delay_us'] or state['started'] is not True or state['stopped']:
            raise ValueError('condition property not held')
        self.emit('n11_pacing_sample',phase=phase,boundary=kind,
                  read_start_ns=witness['property_read_start_ns'],read_end_ns=witness['property_read_end_ns'],observation=state)
        self.emit('n11_condition_sample',phase=phase,boundary=kind,witness=witness)

    def stop_condition(self):
        if self.condition_cleanup:return
        used=self.pressure.used
        if not self.pressure.close():raise ValueError('condition pressure cleanup unconfirmed')
        self.emit('n11_condition_cleanup',condition=self.condition,at_ns=self.now()-self.origin,
                  state='reaped' if used else 'closed_unused',identities=self.pressure.identities(),live_authority=False)
        self.condition_cleanup=True

    def stop_pacing(self):
        try:super().stop_pacing()
        finally:self.stop_condition()

    def tick(self):
        if self.condition_started and not self.condition_cleanup and self.variant['pressure_workers']:
            self.pressure.alive()
        if self.condition_started and self.pacing_stage=='establish' and self.now()-self.condition_started_at<1000000000:
            return False
        before=self.pacing_stage
        complete=super().tick()
        if before=='healthy' and self.pacing_stage=='establish':
            if self.variant['pressure_workers']:
                pressure=self.pressure.start()
            else:
                self.registry()
                pressure=dict(workers=0,maximum_active_ns=20000000000,child_failsafe_ns=40000000000,
                              identities=[],intent_sha256=None,allocation_cores=2)
            self.condition_started_at=self.now()
            self.emit('n11_condition_started',condition=self.condition,at_ns=self.condition_started_at-self.origin,
                      pressure=pressure,generation=self.pacer.generation,live_authority=False)
            self.condition_started=True
        return complete
