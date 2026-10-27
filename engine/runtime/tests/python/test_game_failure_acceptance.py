"""Fault injection owns only its private socket and never overwrites foreign cleanup state."""

import socket
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "n10"))
from game_failure_acceptance import SourceSocketSwap


class SocketFaultTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir="/tmp")
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "X99"
        self.original = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(self.original.close)
        self.original.bind(str(self.path))
        info = self.path.lstat()
        self.capture = SimpleNamespace(socket_device=info.st_dev, socket_inode=info.st_ino)
        self.enterContext(patch("game_failure_acceptance.SOCKET", self.path))
        self.enterContext(patch("game_failure_acceptance.socket_identity", side_effect=lambda: (self.path.lstat().st_dev, self.path.lstat().st_ino)))
        self.enterContext(patch("game_failure_acceptance.GameCaptureContext.from_scene", return_value=self.capture))

    def test_owned_identity_is_changed_then_exact_original_restored_once(self):
        swap = SourceSocketSwap(object(), self.capture)
        self.assertNotEqual(self.path.lstat().st_ino, self.capture.socket_inode)
        self.assertEqual(swap.backup.lstat().st_ino, self.capture.socket_inode)
        self.assertGreaterEqual(self.original.fileno(), 0)
        swap.close()
        swap.close()
        self.assertEqual(self.path.lstat().st_ino, self.capture.socket_inode)
        self.assertFalse(swap.backup.exists())
        self.assertGreaterEqual(self.original.fileno(), 0)

    def test_foreign_replacement_is_not_unlinked_or_overwritten(self):
        swap = SourceSocketSwap(object(), self.capture)
        self.addCleanup(swap.replacement.close)
        self.path.unlink()
        foreign = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(foreign.close)
        foreign.bind(str(self.path))
        inode = self.path.lstat().st_ino
        with self.assertRaisesRegex(ValueError, "identity changed"):
            swap.close()
        self.assertEqual(self.path.lstat().st_ino, inode)
        self.assertTrue(swap.backup.exists())

    def test_wrong_capture_is_rejected_before_any_filesystem_mutation(self):
        with self.assertRaisesRegex(ValueError, "exact owned"):
            SourceSocketSwap(object(), object())
        self.assertEqual(self.path.lstat().st_ino, self.capture.socket_inode)
        self.assertEqual(len(list(self.path.parent.iterdir())), 1)
