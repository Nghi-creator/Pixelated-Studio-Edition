"""Whole paired phases under a separately owned pacing property, no accepted labels."""
from dataclasses import asdict
from pacing_fixture import PacingHandle, read_marker, pacing_variant
from research.live_probe_control.control.contracts import digest
from paired_observation import PairedObservation


class PacingObservation(PairedObservation):
    method="n11-contained-pacing-paired-v1"
    contrast=False
    calibration_index=None
    confirmation=False

    def __init__(self,*args):
        super().__init__(*args)
        self.pacing_stage,self.reference_rows="healthy",[]
        self.reference_sequence=self.pacing_sequence=None
        self.pacer=None
        self.cleanup_emitted=False

    def reference(self,now):
        slots=self.slots(("first",))
        if self.scene.game.poll() is not None:raise ValueError("pacing game lost")
        if slots is None:return False
        if not self.target_ready(slots,30) or not self.ready(slots,continuity=self.pacing_stage=='post'):return False
        identity=self.identity(slots)
        if self.identities is None:self.identities=identity
        if identity!=self.identities:raise ValueError("pacing source changed")
        body,_,sequence=slots['first'].owner.last_observation
        if sequence==self.reference_sequence:return False
        self.reference_sequence=sequence
        self.reference_rows.append(dict(at_ns=now-self.origin,sequence=sequence,**{k:body[k] for k in ('configured_fps','negotiated_fps','capture_buffers','encoded_buffers')},**self.native_read_evidence(slots['first'],body)))
        if self.reference_rows[-1]['at_ns']-self.reference_rows[0]['at_ns']<2000000000:return False
        self.emit('n11_pacing_reference',phase=self.pacing_stage,samples=self.reference_rows,worker_identities=self.identities)
        self.reference_rows=[]
        return True

    def stop_pacing(self):
        if self.pacer is None:return
        try:
            state=self.pacer.stop()
            if not self.cleanup_emitted:
                self.emit('n11_pacing_cleanup',at_ns=self.now()-self.origin,state='restored',observation=state)
                self.cleanup_emitted=True
        except Exception:
            if not self.cleanup_emitted:
                self.emit('n11_pacing_cleanup',at_ns=self.now()-self.origin,state='unknown')
                self.cleanup_emitted=True
            raise

    def checkpoint(self):
        try:self.stop_pacing()
        finally:
            if self.pacer is not None:
                self.emit('n11_pacing_observed_prefix',observations=self.pacer.history)
                failure=self.pacer.directory/'n11-pacing-failure.json'
                if failure.exists():self.emit('n11_pacing_fixture_failure',failure=read_marker(failure))
            super().checkpoint()

    def phase_boundary(self,kind,phase):
        start=self.now()-self.origin
        state=self.pacer.sample(fresh=True)
        if state['sleep_time_us']!=self.pacer.delay_us or state['stopped']:raise ValueError('pacing not persistent')
        self.emit('n11_pacing_sample',phase=phase,boundary=kind,read_start_ns=start,read_end_ns=self.now()-self.origin,observation=state)

    def tick(self):
        now=self.now()
        if self.pacing_stage in ('healthy','post'):
            if not self.reference(now):return False
            if self.pacing_stage=='post':self.pacing_stage='done';return True
            slot=self.service.active['first']
            self.pacer=PacingHandle(self.local,slot,contrast=self.contrast,calibration_index=self.calibration_index,confirmation=self.confirmation)
            state=self.pacer.start()
            self.emit('n11_pacing_started',at_ns=self.pacer.started_at-self.origin,maximum_active_ns=20000000000,observation=state)
            self.pacing_stage='establish'
            return False
        if self.pacing_stage=='done':raise ValueError('pacing acquisition already complete')
        self.pacer.alive()
        if self.pacing_stage=='establish':
            if now-self.pacer.started_at<1000000000:return False
            self.pacing_stage='pair'
        complete=super().tick()
        if complete:
            self.stop_pacing()
            self.pacing_stage='post'
            self.reference_sequence=self.service.active['first'].owner.last_observation[2]
        return False


class PacingContrastObservation(PacingObservation):
    method="n11-contained-pacing-contrast-v1"
    contrast=True


    def native_read_evidence(self, slot, observation):
        start,end=observation['read_start_ns'],observation['read_end_ns']
        if type(start) is not int or type(end) is not int or not 0<=start<=end:
            raise ValueError('native counter read brackets unavailable')
        return dict(native_read=dict(method='native-counter-read-brackets-v1',
                    clock_id='worker-monotonic-'+digest(asdict(slot.owner.generation)),
                    basis='worker_elapsed_monotonic_ns',read_start_ns=start,read_end_ns=end))


class PacingCapacityObservation(PacingContrastObservation):
    contrast=False

    def __init__(self,*args,calibration_index,confirmation=False):
        pacing_variant(calibration_index=calibration_index,confirmation=confirmation)
        self.calibration_index,self.confirmation=calibration_index,confirmation
        kind='confirmation' if confirmation else 'calibration'
        self.method='n11-contained-pacing-capacity-'+kind+'-v1'
        super().__init__(*args)
