"""Live control screening fails closed on source, freshness and early completion."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "n10"))
from camera_config import parse_stream_profile
from control_disturbance import ControlDisturbance
from live_probe_control.contracts import Generation, Policy
from live_probe_control.probe_transport import EngineeringControl
from native_browser_acceptance import ACCEPTANCE_PROFILE
from observer_native_screen import NativeScreen


class ControlAcquisitionTests(unittest.TestCase):
    def make(self):
        policy = Policy(24, 60, 5000000000, 3, 12000000000, 1000000000, 20, 100000000)
        service = SimpleNamespace(source="isolated_synthetic", control=EngineeringControl("/tmp/owned", policy, 1, 1))
        return ControlDisturbance(service, Mock(), Mock(), Mock(), object(), Mock())

    def test_acceptance_profile_uses_camera_wire_keys_and_exact_encoder_context(self):
        import json

        profile = parse_stream_profile(json.dumps(ACCEPTANCE_PROFILE))
        self.assertEqual((profile["id"], profile["fps"], profile["bitrate_kbps"], profile["cpu_used"], profile["max_quantizer"]),
                         ("balanced", 30, 1500, 6, 48))

    def test_native_sampler_rejects_fallback_bitrate_before_collecting_a_window(self):
        body = {"connection_state": "connected", "ice_connection_state": "completed", "configured_fps": 30,
                "negotiated_fps": 30, "width": 640, "height": 480, "target_bitrate": 1000000,
                "cpu_used": 6, "max_quantizer": 48, "capture_buffers": 1, "encoded_buffers": 1}
        slot = SimpleNamespace(owner=SimpleNamespace(last_observation=(body, 1000000000), child=None),
                               failure=None, stop=SimpleNamespace(is_set=lambda: False), done=SimpleNamespace(is_set=lambda: False))
        sampler = NativeScreen(SimpleNamespace(active={"first": slot, "second": slot}), Mock())
        with patch("observer_native_screen.time.monotonic_ns", return_value=1000000000), self.assertRaisesRegex(ValueError, "profile/caps changed"):
            sampler.sample()
        self.assertEqual(sampler.samples, [])

    def test_production_source_cannot_construct_the_engineering_screen(self):
        for source in ("production", "isolated_game", None):
            with self.assertRaisesRegex(ValueError, "synthetic engineering"):
                ControlDisturbance(SimpleNamespace(source=source, control=None), Mock(), Mock(), Mock(), object(), Mock())

    def test_missing_native_eligibility_has_a_fixed_deadline(self):
        screen = self.make()
        with (patch.object(screen, "slots", return_value=None),
              patch("control_disturbance.time.monotonic_ns", return_value=screen.origin + 8000000001),
              self.assertRaisesRegex(ValueError, "deadline")):
            screen.tick()
        screen.local.dispatch.assert_not_called()

    def test_early_action_completion_fails_before_active_window_sampling(self):
        screen = self.make()
        screen.stage, screen.phase = "measure", "during"
        screen.operation = SimpleNamespace(done=SimpleNamespace(is_set=lambda: True))
        screen.sampler = Mock()
        with patch.object(screen, "slots", return_value={}), self.assertRaisesRegex(ValueError, "ended inside"):
            screen.tick()
        screen.sampler.sample.assert_not_called()

    def test_worker_replacement_is_not_an_independent_restoration(self):
        screen = self.make()
        slot = SimpleNamespace(token="new", sdp="offer", owner=SimpleNamespace(generation=Generation("owner", "pipeline", "peer")))
        screen.identities = {"first": "a" * 64}
        with patch.object(screen, "slots", return_value={"first": slot}), self.assertRaisesRegex(ValueError, "lifetime/offer"):
            screen.tick()
