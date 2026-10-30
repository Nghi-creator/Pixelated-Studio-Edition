"""Explicit contained fixture randomness must survive the game's own reseeding."""

import shutil
import subprocess
import unittest

from live_probe_control.game_scene import FIXTURE_RANDOMNESS, GameScene, game_command


class FixtureRandomnessTests(unittest.TestCase):
    def test_original_scene_command_is_preserved_unless_explicitly_selected(self):
        original = game_command()
        seeded = game_command(fixed_seed=True)
        self.assertEqual(original[0], "/usr/games/frozen-bubble")
        self.assertEqual(seeded[:2], ["/usr/bin/perl", "-e"])
        self.assertEqual(seeded[3:], ["--", *original[1:]])
        self.assertIn(FIXTURE_RANDOMNESS, seeded[2])
        self.assertFalse(GameScene().fixed_seed)
        for value in (1, "1", None):
            with self.assertRaises(ValueError):
                GameScene(fixed_seed=value)

    @unittest.skipUnless(shutil.which("perl"), "Perl is required by the owned game image")
    def test_initial_and_explicit_reseeding_are_repeatable_across_processes(self):
        program = FIXTURE_RANDOMNESS + """
print join(',', map { rand() } 1..8), "\\n";
srand(123); print join(',', map { rand() } 1..8), "\\n";
srand(999999); print join(',', map { rand() } 1..8), "\\n";
"""
        outputs = [subprocess.run([shutil.which("perl"), "-e", program], capture_output=True,
                                  text=True, check=True, timeout=3).stdout for _ in range(2)]
        self.assertEqual(outputs[0], outputs[1])
        lines = outputs[0].splitlines()
        self.assertEqual(len(lines), 3)
        self.assertEqual(lines[0], lines[1])
        self.assertEqual(lines[1], lines[2])
