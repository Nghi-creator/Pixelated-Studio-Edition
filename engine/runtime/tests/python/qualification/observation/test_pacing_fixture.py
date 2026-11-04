"""Fixture-only pacing: independent property, watchdog and exact cleanup."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0,str(Path(__file__).resolve().parents[4]/'scripts/research/n10'))
from pacing_fixture import ElementPacer, peer_subprocess_proxy, close_paced_media


class PacingTests(unittest.TestCase):
    def make(self):
        element=Mock();self.value=0
        element.get_property.side_effect=lambda key:self.value
        element.set_property.side_effect=lambda key,value:setattr(self,'value',value)
        timer=Mock()
        owner=ElementPacer(element,lambda:True,timer=lambda seconds,callback:timer)
        return owner,element,timer

    def test_fixed_separate_property_has_single_use_timer_and_idempotent_cleanup(self):
        owner,element,timer=self.make();owner.start()
        self.assertEqual(owner.observe(),50000)
        self.assertEqual(element.set_property.call_args.args,('sleep-time',50000))
        timer.start.assert_called_once()
        with self.assertRaises(ValueError):owner.start()
        self.assertTrue(owner.stop());self.assertTrue(owner.stop());self.assertEqual(self.value,0)

    def test_foreign_setting_or_lost_ownership_is_never_overwritten(self):
        for foreign in [True,False]:
            owner,element,_=self.make();owner.start();element.set_property.reset_mock()
            if foreign:self.value=25000
            else:owner.owns=lambda:False
            self.assertFalse(owner.stop());element.set_property.assert_not_called()

    def test_watchdog_restores_property_but_invalidates_continued_measurement(self):
        owner,_,_=self.make();owner.start();owner.expire()
        self.assertEqual(self.value,0)
        with self.assertRaises(ValueError):owner.observe()

    def test_fixture_launcher_refuses_other_commands(self):
        proxy=peer_subprocess_proxy()
        with self.assertRaisesRegex(ValueError,'exact fixture'):proxy.Popen(['arbitrary'])

    def test_close_is_idempotent_and_always_tears_down_after_publish_failure(self):
        media=SimpleNamespace(_pacer=Mock())
        media._pacer.stop.return_value=True
        close=Mock(return_value=True);publish=Mock()
        self.assertTrue(close_paced_media(media,close,publish))
        self.assertTrue(close_paced_media(media,close,publish));close.assert_called_once()
        media=SimpleNamespace(_pacer=Mock())
        close=Mock(return_value=True)
        self.assertFalse(close_paced_media(media,close,Mock(side_effect=OSError('write failed'))))
        close.assert_called_once()

    def test_cleanup_before_start_does_not_claim_an_unowned_delay(self):
        owner,element,_=self.make();self.value=50000
        self.assertFalse(owner.stop())
        element.set_property.assert_not_called()

    def test_contrast_delay_is_fixed_and_foreign_default_delay_is_not_cleared(self):
        element=Mock();value=[0]
        element.get_property.side_effect=lambda _:value[0]
        element.set_property.side_effect=lambda _,v:value.__setitem__(0,v)
        pacer=ElementPacer(element,lambda:True,timer=lambda *a:Mock(),delay_us=37500)
        pacer.start();self.assertEqual(pacer.observe(),37500)
        value[0]=50000;element.set_property.reset_mock()
        self.assertFalse(pacer.stop());element.set_property.assert_not_called()
        for bad in (True,35000,0,50000.0):
            with self.assertRaises(ValueError):ElementPacer(element,lambda:True,delay_us=bad)

    def test_contrast_launcher_has_explicit_fixed_child_entrypoint(self):
        import subprocess
        with patch.object(subprocess,'Popen') as launch:
            proxy=peer_subprocess_proxy(contrast=True)
            proxy.Popen([sys.executable,'-u','-m','research.live_probe_control.peers.peer_worker','--dedicated-peer-worker'])
            self.assertIn("child_main'](contrast=True)",launch.call_args.args[0][3])
        with self.assertRaises(ValueError):peer_subprocess_proxy(contrast=1)

    def test_native_read_evidence_is_contrast_only_and_preserves_worker_bounds(self):
        from paired_observation import PairedObservation
        from pacing_observation import PacingContrastObservation
        from research.live_probe_control.control.contracts import Generation, digest
        self.assertEqual(PairedObservation.__new__(PairedObservation).native_read_evidence(None,None),{})
        generation=Generation('owner','pipeline','peer')
        slot=SimpleNamespace(owner=SimpleNamespace(generation=generation))
        observer=PacingContrastObservation.__new__(PacingContrastObservation)
        body=dict(read_start_ns=100,read_end_ns=200)
        result=observer.native_read_evidence(slot,body)['native_read']
        self.assertEqual(result['read_start_ns'],100);self.assertEqual(result['read_end_ns'],200)
        self.assertEqual(result['clock_id'],'worker-monotonic-'+digest(dict(owner='owner',pipeline='pipeline',peer='peer')))
        for bad in (dict(read_start_ns=True,read_end_ns=200),dict(read_start_ns=201,read_end_ns=200)):
            with self.assertRaises(ValueError):observer.native_read_evidence(slot,bad)
