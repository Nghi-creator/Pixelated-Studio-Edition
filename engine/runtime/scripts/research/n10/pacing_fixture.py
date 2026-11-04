"""Disposable isolated-game pacing launcher; ordinary worker protocol unchanged."""
import os
import subprocess
import sys
import threading
import time
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parent))
from game_thread_fault import read_marker, write_marker

METHOD = "n11-owned-pacing-v1"
CONTRAST_METHOD = "n11-owned-pacing-contrast-v1"
START, STOP, STATE = "n11-pacing-start.json", "n11-pacing-stop.json", "n11-pacing-state.json"

CAPACITY_GRID=(0,30000,32000,34000,36000,37500,40000,50000)


def pacing_variant(*,contrast=False,calibration_index=None,confirmation=False):
    if type(contrast) is not bool or type(confirmation) is not bool or (calibration_index is None and confirmation):
        raise ValueError('closed pacing variant required')
    if calibration_index is not None:
        if type(calibration_index) is not int or not 0<=calibration_index<len(CAPACITY_GRID) or contrast:
            raise ValueError('closed capacity grid required')
        kind='confirmation' if confirmation else 'calibration'
        return 'n11-owned-pacing-capacity-'+kind+'-v1',CAPACITY_GRID[calibration_index]
    return (CONTRAST_METHOD,37500) if contrast else (METHOD,50000)


class ElementPacer:
    def __init__(self, element, owns, timer=threading.Timer, *, delay_us=50000, calibration_index=None):
        if calibration_index is not None:
            if type(delay_us) is not int or delay_us!=50000:raise ValueError('mixed pacing variants')
            _,delay_us=pacing_variant(calibration_index=calibration_index)
        elif type(delay_us) is not int or delay_us not in (50000,37500):
            raise ValueError("closed fixed pacing variant required")
        self.delay_us=delay_us
        self.element, self.owns, self.timer_factory = element, owns, timer
        self.lock, self.timer = threading.RLock(), None
        self.started = self.expired = self.failed = False

    def start(self):
        with self.lock:
            if self.started or not self.owns() or self.element.get_property("sleep-time") != 0:
                raise ValueError("fresh pacing preimage required")
            self.started = True
            try:
                self.element.set_property("sleep-time", self.delay_us)
                if self.element.get_property("sleep-time") != self.delay_us:
                    raise ValueError("pacing apply failed")
                self.timer = self.timer_factory(20, self.expire)
                self.timer.daemon = True
                self.timer.start()
            except BaseException:
                self.failed = True
                self.stop()
                raise

    def observe(self):
        with self.lock:
            if not self.owns() or self.expired or self.failed:
                raise ValueError("pacing ownership/watchdog lost")
            value = self.element.get_property("sleep-time")
            if value != (self.delay_us if self.started else 0):
                raise ValueError("foreign pacing setting")
            return value

    def stop(self):
        with self.lock:
            if self.timer is not None: self.timer.cancel()
            if not self.owns():
                self.failed = True
                return False
            value = self.element.get_property("sleep-time")
            if value not in ((0, self.delay_us) if self.started else (0,)):
                self.failed = True
                return False
            if value == self.delay_us: self.element.set_property("sleep-time", 0)
            ok = self.element.get_property("sleep-time") == 0
            self.failed = self.failed or not ok
            return ok

    def expire(self):
        with self.lock:
            self.stop()
            self.expired = True


def peer_subprocess_proxy(*, contrast=False, calibration_index=None, confirmation=False):
    pacing_variant(contrast=contrast,calibration_index=calibration_index,confirmation=confirmation)
    original = subprocess.Popen
    helper = str(Path(__file__).resolve())
    def launch(argv, **kwargs):
        if argv != [sys.executable,"-u","-m","research.live_probe_control.peers.peer_worker","--dedicated-peer-worker"]:
            raise ValueError("exact fixture peer command required")
        code="import runpy; runpy.run_path("+repr(helper)+",run_name='__main__')"
        if contrast:code="import runpy; ns=runpy.run_path("+repr(helper)+"); raise SystemExit(ns['child_main'](contrast=True))"
        if calibration_index is not None:code="import runpy; ns=runpy.run_path("+repr(helper)+"); raise SystemExit(ns['child_main'](calibration_index="+str(calibration_index)+",confirmation="+repr(confirmation)+"))"
        return original([sys.executable,"-u","-c",code,"--dedicated-peer-worker"],**kwargs)
    return SimpleNamespace(Popen=launch, PIPE=subprocess.PIPE, TimeoutExpired=subprocess.TimeoutExpired)


def child_main(*, contrast=False, calibration_index=None, confirmation=False):
    method,delay=pacing_variant(contrast=contrast,calibration_index=calibration_index,confirmation=confirmation)
    if sys.argv[1:] != ["--dedicated-peer-worker"]:
        raise ValueError("explicit disposable worker required")
    from research.live_probe_control.peers import peer_worker
    from research.live_probe_control.control.probe_transport import EngineeringControl
    original_init, original_poll, original_close = peer_worker.PeerMedia.__init__, peer_worker.PeerMedia.poll, peer_worker.PeerMedia.close

    def initialize(media, bootstrap, emit):
        original_init(media, bootstrap, emit)
        if bootstrap["body"]["source"] != "isolated_game" or media.capture_lease is None:
            raise ValueError("owned isolated game required")
        config = EngineeringControl.from_wire(bootstrap["body"]["control"])
        directory = Path(config.directory)
        info = directory.stat()
        if (info.st_dev,info.st_ino)!=(config.device,config.inode) or info.st_uid!=os.getuid():
            raise ValueError("pacing owner directory changed")
        element = media.pipeline.get_by_name("captured")
        if element is None or element.get_factory().get_name()!="identity" or element.get_property("sync") or element.get_property("drop-probability")!=0:
            raise ValueError("idle exact identity required")
        media._pacer = ElementPacer(element,lambda:not media.closed and media.pipeline.get_by_name("captured")==element and media.capture_lease.healthy(force=True),**(dict(calibration_index=calibration_index) if calibration_index is not None else dict(delay_us=delay)))
        media._pacing_dir, media._pacing_sequence, media._pacing_next, media._pacing_stopped = directory, 0, 0, False

    def publish(media):
        media._pacing_sequence += 1
        value=dict(method=method,generation=media.bootstrap["generation"],sequence=media._pacing_sequence,
                   worker_elapsed_ns=time.monotonic_ns()-media.origin,sleep_time_us=media._pacer.element.get_property("sleep-time"),
                   stopped=media._pacing_stopped,expired=media._pacer.expired,failed=media._pacer.failed)
        if calibration_index is not None:value["started"]=media._pacer.started
        pending=media._pacing_dir/(STATE+".pending")
        with pending.open("x") as stream:
            import json
            stream.write(json.dumps(value,allow_nan=False))
        os.replace(pending,media._pacing_dir/STATE)

    def poll_inner(media):
        original_poll(media)
        expected=dict(method=method,generation=media.bootstrap["generation"])
        if not media._pacer.started and (media._pacing_dir/START).exists():
            if read_marker(media._pacing_dir/START)!=expected: raise ValueError("foreign pacing request")
            media._pacer.start()
        if not media._pacing_stopped and (media._pacing_dir/STOP).exists():
            if read_marker(media._pacing_dir/STOP)!=expected or not media._pacer.started: raise ValueError("foreign pacing cleanup")
            if not media._pacer.stop(): raise ValueError("pacing cleanup unverified")
            media._pacing_stopped=True
        if not media._pacing_stopped: media._pacer.observe()
        if time.monotonic_ns()>=media._pacing_next:
            publish(media);media._pacing_next=time.monotonic_ns()+100000000

    def poll(media):
        try:
            poll_inner(media)
        except Exception as error:
            # Fixture-only failure evidence; retain the ordinary worker failure path.
            try:
                write_marker(media._pacing_dir/"n11-pacing-failure.json",
                             dict(method=method,stage="poll",error_type=type(error).__name__,detail=str(error)[:256]))
            except Exception:
                pass
            raise

    def close(media):
        return close_paced_media(media,original_close,publish)

    with patch.object(peer_worker.PeerMedia,"__init__",initialize),patch.object(peer_worker.PeerMedia,"poll",poll),patch.object(peer_worker.PeerMedia,"close",close):
        return peer_worker.main()


def close_paced_media(media, original_close, publish):
    if hasattr(media,"_pacing_close_ok"):
        return media._pacing_close_ok
    ok=True
    try:
        if hasattr(media,"_pacer"):
            ok=media._pacer.stop()
            media._pacing_stopped=True
            publish(media)
    except Exception:
        ok=False
    finally:
        media._pacing_close_ok=False
        closed=original_close(media)
    media._pacing_close_ok=bool(closed and ok)
    return media._pacing_close_ok


class PacingHandle:
    def __init__(self, local, slot, *, contrast=False, calibration_index=None, confirmation=False):
        self.method,self.delay_us=pacing_variant(contrast=contrast,calibration_index=calibration_index,confirmation=confirmation)
        self.capacity=calibration_index is not None
        self.directory, self.slot = Path(local.directory), slot
        self.generation, self.token = asdict(slot.owner.generation), slot.token
        self.sequence, self.started_at, self.stopped = 0, None, False
        self.history, self.last_stopped = [], None

    def current(self):
        if self.slot.token!=self.token or asdict(self.slot.owner.generation)!=self.generation or self.slot.failure or self.slot.stop.is_set() or self.slot.done.is_set():
            raise ValueError("pacing worker changed: "+str(self.slot.failure)+"/"+str(self.slot.owner.state)+"/"+str(self.slot.owner.reason))

    def sample(self, *, fresh=False):
        self.current(); end=time.monotonic()+0.3
        while True:
            try: value=read_marker(self.directory/STATE)
            except FileNotFoundError: value=None
            if value is not None and (not fresh or value["sequence"]>self.sequence): break
            if time.monotonic()>=end: raise ValueError("pacing observation deadline")
            time.sleep(0.005)
        if value.get("method")!=self.method or value.get("generation")!=self.generation or value.get("expired") or value.get("failed") or type(value.get("sequence")) is not int or value['sequence']<self.sequence:
            raise ValueError("invalid pacing observation")
        self.sequence=value["sequence"]
        self.history.append(dict(value))
        return value

    def start(self):
        if self.started_at is not None: raise ValueError("pacing single use")
        before=self.sample(fresh=True)
        if before["sleep_time_us"]!=0 or before["stopped"] or (self.capacity and before.get("started") is not False): raise ValueError("pacing preimage unavailable")
        self.started_at=time.monotonic_ns()
        write_marker(self.directory/START,dict(method=self.method,generation=self.generation))
        return self.wait_for(self.delay_us,False)

    def wait_for(self, delay, stopped):
        end=time.monotonic()+0.6
        while True:
            value=self.sample(fresh=True)
            if value["sleep_time_us"]==delay and value["stopped"] is stopped and (not self.capacity or value.get("started") is True):return value
            if time.monotonic()>=end:raise ValueError("pacing transition unobserved")

    def alive(self):
        self.current()
        if self.started_at is None or self.stopped or time.monotonic_ns()-self.started_at>=20000000000:
            raise ValueError("pacing lifetime lost")

    def stop(self):
        if self.stopped:return dict(self.last_stopped)
        self.current()
        if self.started_at is None:return self.sample(fresh=True)
        expected=dict(method=self.method,generation=self.generation)
        if (self.directory/STOP).exists():
            if read_marker(self.directory/STOP)!=expected:raise ValueError("foreign pacing cleanup intent")
        else:write_marker(self.directory/STOP,expected)
        value=self.wait_for(0,True)
        self.stopped=True
        self.last_stopped=dict(value)
        return value


if __name__=="__main__":raise SystemExit(child_main())
