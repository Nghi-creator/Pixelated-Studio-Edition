"""Real private files with synthetic worker/clock ports; no native acquisition."""

import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from research.live_probe_control.control.contracts import Generation
from research.physical_challenges.channel import STATE, ChallengeFileService, OwnedDirectory
from research.physical_challenges.handle import ChallengeHandle
from research.physical_challenges.peer import MAX_ACK_BYTES, ChallengeEndpoint, decode, encode

from qualification.observation import test_physical_challenge_lifecycle as fixtures


class ChannelTests(unittest.TestCase):
    def make(self, recipe="mixed_delay_pressure"):
        self.fixture = fixtures.LifecycleTests("test_closed_controller_cannot_be_restarted")
        lifecycle = self.fixture.make()
        self.addCleanup(self.fixture.doCleanups)
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        anchor = OwnedDirectory(directory.name)
        self.addCleanup(anchor.close)
        endpoint = ChallengeEndpoint(lifecycle, recipe, "a" * 64)
        self.service = ChallengeFileService(endpoint, anchor, clock=self.fixture.clock)
        self.addCleanup(lifecycle.close)
        local = SimpleNamespace(directory=directory.name)
        generation = Generation(**self.fixture.generation)
        slot = SimpleNamespace(
            token=object(),
            owner=SimpleNamespace(generation=generation),
            failure=None,
            stop=threading.Event(),
            done=threading.Event(),
        )

        def pump(seconds):
            self.fixture.clock.advance(seconds)
            self.service.poll()

        handle = ChallengeHandle(local, slot, recipe, clock=self.fixture.clock, sleep=pump)
        self.addCleanup(handle.release)
        return handle, anchor

    def test_files_execute_complete_request_ack_transcript(self):
        handle, _ = self.make()
        handle.send("start")
        handle.wait_established()
        for phase in ("degraded", "relief", "recovery"):
            if phase == "relief":
                handle.send("prepare_relief")
                handle.wait_established()
                handle.send("dispatch_relief")
            handle.send("begin_" + phase)
            self.fixture.clock.advance(3.2)
            handle.send("end_" + phase)
        handle.stop()
        self.assertEqual(len(handle.transcript["records"]), 10)
        self.assertEqual(handle.sample(fresh=True)["witness"]["delay_us"], 0)
        transcript = handle.transcript
        transcript["records"].clear()
        self.assertEqual(len(handle.transcript["records"]), 10)

    def test_closed_file_namespace_and_no_overwrite(self):
        _, anchor = self.make()
        with self.assertRaises(ValueError):
            anchor.write("../escape", b"{}")
        anchor.write("n11-challenge-command-01.json", b"{}")
        with self.assertRaises(FileExistsError):
            anchor.write("n11-challenge-command-01.json", b"changed")
        self.assertEqual(anchor.read("n11-challenge-command-01.json", 4096), b"{}")

    def test_state_symlink_replacement_is_not_overwritten_or_followed(self):
        _, anchor = self.make()
        path = Path(anchor.path) / STATE
        path.unlink()
        path.symlink_to("foreign")
        with self.assertRaises(ValueError):
            self.service.publish()
        self.assertTrue(path.is_symlink())

    def test_slot_rebinding_cannot_send_command(self):
        handle, _ = self.make()
        handle.slot.token = object()
        with self.assertRaises(ValueError):
            handle.send("start")
        self.assertFalse(list(Path(handle.directory.path).glob("*command*")))

    def test_released_directory_cannot_fall_back_to_the_working_directory(self):
        _, anchor = self.make()
        anchor.close()
        with patch(
            "os.open", side_effect=AssertionError("closed directory attempted OS I/O")
        ) as opened:
            with self.assertRaises(ValueError):
                anchor.write("n11-challenge-command-01.json", b"{}")
            opened.assert_not_called()

    def test_ack_byte_hash_cannot_be_replaced_with_other_request(self):
        handle, anchor = self.make()
        handle.send("start")
        frame = decode(anchor.read(STATE, MAX_ACK_BYTES), MAX_ACK_BYTES)
        frame["snapshot"]["channel_id"] = "b" * 64
        anchor.write(STATE, encode(frame), snapshot=True)
        with self.assertRaises(ValueError):
            handle.sample()

    def test_proxy_rejects_any_other_subprocess_command(self):
        from research.physical_challenges.worker import peer_subprocess_proxy

        with self.assertRaises(ValueError):
            peer_subprocess_proxy("owned_cpu_pressure")
        with self.assertRaises(ValueError):
            peer_subprocess_proxy("mixed_delay_pressure").Popen(["arbitrary"])

    def test_worker_close_still_tears_down_media_when_receipt_publish_fails(self):
        from research.physical_challenges.worker import close_challenge_media

        media = SimpleNamespace(
            _challenge_endpoint=SimpleNamespace(lifecycle=Mock()),
            _challenge_service=Mock(),
            _challenge_directory=Mock(),
        )
        media._challenge_endpoint.lifecycle.close.return_value = True
        media._challenge_service.publish.side_effect = OSError("receipt failure")
        original = Mock(return_value=True)
        self.assertFalse(close_challenge_media(media, original))
        original.assert_called_once_with(media)
        media._challenge_directory.close.assert_called_once()

    def test_failed_worker_cleanup_can_attempt_safety_cleanup_again(self):
        from research.physical_challenges.worker import close_challenge_media

        media = SimpleNamespace(
            _challenge_endpoint=SimpleNamespace(lifecycle=Mock()),
            _challenge_service=Mock(),
            _challenge_directory=Mock(),
        )
        media._challenge_endpoint.lifecycle.close.side_effect = [False, True]
        original = Mock(return_value=True)
        self.assertFalse(close_challenge_media(media, original))
        self.assertTrue(close_challenge_media(media, original))
        self.assertEqual(media._challenge_endpoint.lifecycle.close.call_count, 2)


if __name__ == "__main__":
    unittest.main()
