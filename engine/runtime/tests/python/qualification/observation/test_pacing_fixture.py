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
