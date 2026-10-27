"""Real Linux capture pins observe source loss without terminating the display."""

import os
import subprocess
import sys
import unittest
from unittest.mock import patch

from live_probe_control.contained_capture import GameCaptureContext, PinnedGameCapture
from live_probe_control.game_scene import GameScene


@unittest.skipUnless(sys.platform == "linux" and os.environ.get("N10_NATIVE_PEER_TESTS") == "1", "opt-in Linux capture pins")
class NativeCaptureTests(unittest.TestCase):
    def test_exact_owned_scene_loss_invalidates_pins_but_does_not_kill_its_display(self):
        scene = GameScene()
        original = subprocess.Popen

        def private_display(argv, *args, **kwargs):
            if argv[0] == "/usr/bin/Xvfb":
                argv = [argv[0], ":99", *argv[1:]]
            return original(argv, *args, **kwargs)

        try:
            with patch("live_probe_control.game_scene.subprocess.Popen", side_effect=private_display):
                scene.start()
            context = GameCaptureContext.from_scene(scene)
            with PinnedGameCapture(context, expected_owner=os.getpid()) as lease:
                self.assertTrue(lease.healthy(force=True))
                scene.game.terminate()
                scene.game.wait(timeout=3)
                self.assertFalse(lease.healthy())
                self.assertIsNone(scene.display.poll())
        finally:
            self.assertTrue(scene.close())
