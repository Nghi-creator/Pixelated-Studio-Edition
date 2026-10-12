"""Frozen assignments, private inbox and explicit unavailable acquisition behavior."""

import copy
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scenario_harness.camera_runtime import Availability, WorkloadDeclaration
from scenario_harness.campaign import CampaignExecutor, read_private
from scenario_harness.campaign_cli import main
from scenario_harness.campaign_plan import decode, validate


def plan():
    return dict(
        schema_version="n5-campaign-plan-v1",
        campaign_id="campaign-1",
        core_version="a" * 40,
        producer_version="b" * 40,
        node_id="node-1",
        workload_id="workload-1",
        node_version="26.4.0",
        host_workers=1,
        seed=7,
        trials=[
            dict(
                run_id="run-1",
                source_id="c" * 32,
                scenario="healthy",
                assignment="engineering",
                repeat_index=1,
            )
        ],
    )


class CampaignTests(unittest.TestCase):
    def test_submit_cancel_clear_and_overhead_validation_preserve_frozen_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            source = root / "plan.json"
            source.write_text(json.dumps(plan()))
            with redirect_stderr(io.StringIO()) as errors:
                self.assertEqual(
                    main(["submit-overhead", "--directory", str(root), "--plan", str(source)]), 1
                )
                self.assertFalse((root / "overhead-request.json").exists())
                self.assertEqual(
                    main(["submit", "--directory", str(root), "--plan", str(source)]), 0
                )
                original = (root / "request.json").read_bytes()
                self.assertEqual(
                    main(["submit", "--directory", str(root), "--plan", str(source)]), 1
                )
                self.assertEqual(original, (root / "request.json").read_bytes())
                self.assertEqual(main(["cancel", "--directory", str(root)]), 0)
                self.assertEqual((root / "cancel.json").read_bytes(), b'{"cancel":true}\n')
                self.assertEqual(main(["clear-request", "--directory", str(root)]), 0)
                self.assertFalse((root / "request.json").exists())
                self.assertTrue(source.exists())
            self.assertEqual(errors.getvalue(), "error: N5 campaign command failed\n" * 2)

    def test_missing_engine_workload_declaration_is_unavailable_before_prepare(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = CampaignExecutor(
                SimpleNamespace(peers={"peer": object()}), Path(tmp).resolve()
            ).run(plan())
            self.assertEqual(result["state"], "trial_failed")
            self.assertEqual(result["trials"][0]["reason"], "source_unavailable")
            self.assertIsNone(result["trials"][0]["file_name"])

    def test_unexpected_preflight_failure_retains_terminal_catalog(self):
        class Broken:
            def __init__(self, *args):
                pass

            def preflight(self, *args):
                raise RuntimeError("private diagnostic")

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            camera = SimpleNamespace(
                peers={"peer": object()},
                N5_WORKLOAD_DECLARATION=WorkloadDeclaration("workload-1", 7, "26.4.0"),
            )
            result = CampaignExecutor(camera, root, runtime_factory=Broken).run(plan())
            self.assertEqual(result["state"], "campaign_failed")
            self.assertEqual(result["trials"], [])
            self.assertEqual(
                json.loads((root / "campaign-1/campaign-index.json").read_bytes())["state"],
                "campaign_failed",
            )

    def test_prepare_freezes_distinct_sources_and_declared_assignments(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve() / "plan.json"
            self.assertEqual(
                main(
                    [
                        "prepare",
                        "--output",
                        str(path),
                        "--core-version",
                        "a" * 40,
                        "--producer-version",
                        "b" * 40,
                        "--node-version",
                        "26.4.0",
                    ]
                ),
                0,
            )
            value = decode(path.read_bytes())
            self.assertEqual(len(value["trials"]), 18)
            self.assertEqual(len({t["source_id"] for t in value["trials"]}), 18)
            before = path.read_bytes()
            self.assertEqual(
                main(
                    [
                        "prepare",
                        "--output",
                        str(path),
                        "--core-version",
                        "a" * 40,
                        "--producer-version",
                        "b" * 40,
                        "--node-version",
                        "26.4.0",
                    ]
                ),
                1,
            )
            self.assertEqual(before, path.read_bytes())

    def test_duplicates_private_metadata_and_coercion_reject(self):
        for drift in ("source", "extra", "bool", "scenario"):
            value = plan()
            if drift == "source":
                other = copy.deepcopy(value["trials"][0])
                other.update(run_id="run-2", repeat_index=2)
                value["trials"].append(other)
            elif drift == "extra":
                value["private_path"] = "/secret"
            elif drift == "bool":
                value["seed"] = True
            else:
                value["trials"][0]["scenario"] = "network_loss"
            with self.assertRaises(ValueError):
                validate(value)
        with self.assertRaises(ValueError):
            decode(b'{"seed":1,"seed":2}')
        with self.assertRaises(ValueError):
            decode(b" " * 65537)

    def test_real_unavailability_exports_no_invented_versions_or_acquisition(self):
        class Unavailable:
            def __init__(self, *args):
                pass

            def preflight(self, *args):
                return Availability("unavailable", "runtime_unavailable")

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            executor = CampaignExecutor(
                SimpleNamespace(
                    peers={"peer": object()},
                    N5_WORKLOAD_DECLARATION=WorkloadDeclaration("workload-1", 7, "26.4.0"),
                ),
                root,
                runtime_factory=Unavailable,
            )
            result = executor.run(plan())
            row = result["trials"][0]
            self.assertEqual((result["state"], row["status"]), ("trial_failed", "unavailable"))
            self.assertIsNone(row["file_name"])
            self.assertIsNone(row["acquisition_started_ns"])
            self.assertEqual(
                set(p.name for p in (root / "campaign-1").iterdir()),
                {"campaign-plan.json", "campaign-index.json"},
            )
            with self.assertRaises(FileExistsError):
                executor.run(plan())

    def test_private_inbox_rejects_symlinks_and_nonprivate_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            file = root / "request.json"
            file.write_text(json.dumps(plan()))
            file.chmod(0o644)
            with self.assertRaises(ValueError):
                read_private(root, "request.json")
            file.chmod(0o600)
            (root / "alias.json").symlink_to(file)
            with self.assertRaises(OSError):
                read_private(root, "alias.json")
            self.assertEqual(decode(read_private(root, "request.json")), plan())


if __name__ == "__main__":
    unittest.main()
