"""Execute actual camera teardown code without importing GI or starting a server."""

import ast
import types
import unittest
from pathlib import Path


class LifecycleTests(unittest.TestCase):
    def execute_shutdown(self, fail_state_write=False):
        tree = ast.parse((Path(__file__).resolve().parents[2] / "camera.py").read_text())
        cleanup = next(
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "cleanup_peer"
        )
        loop_try = next(
            node
            for node in tree.body
            if isinstance(node, ast.Try)
            and any(
                isinstance(child, ast.Attribute) and child.attr == "run" for child in ast.walk(node)
            )
        )
        calls, peers = [], {}
        for name in ["first", "second"]:
            peers[name] = {
                "pipeline": types.SimpleNamespace(
                    set_state=lambda state, name=name: calls.append((name, state))
                ),
                "stage_trace": types.SimpleNamespace(
                    close=lambda reason, name=name: calls.append((name, reason))
                ),
            }

        def write_state(*_args):
            if fail_state_write:
                raise OSError("state write failed")

        def interrupt():
            raise KeyboardInterrupt()

        namespace = {
            "peers": peers,
            "os": types.SimpleNamespace(environ={}),
            "export_camera_trace": lambda recording, environment: calls.append(
                ("export", "after_finish")
            ),
            "Gst": types.SimpleNamespace(State=types.SimpleNamespace(NULL="NULL")),
            "SESSION_ID": "private-not-exported",
            "PEER_STATE_PATH": "unused",
            "TELEMETRY_STATE_PATH": "unused",
            "write_peer_state": write_state,
            "write_encoder_telemetry": write_state,
            "loop": types.SimpleNamespace(run=interrupt),
            "STAGE_TRACE": types.SimpleNamespace(
                finish=lambda reason: calls.append(("recording", reason))
            ),
            "print": lambda *_args: None,
        }
        module = ast.Module(body=[cleanup, loop_try], type_ignores=[])
        with self.assertRaises(KeyboardInterrupt):
            # Execute only the trusted local teardown AST, never supplied trace data.
            exec(compile(module, "camera-teardown", "exec"), namespace)  # noqa: S102
        self.assertEqual(peers, {})
        self.assertEqual(
            calls,
            [
                ("first", "shutdown"),
                ("first", "NULL"),
                ("second", "shutdown"),
                ("second", "NULL"),
                ("recording", "shutdown"),
                ("export", "after_finish"),
            ],
        )

    def test_interrupt_closes_every_binding_before_pipeline_teardown(self):
        self.execute_shutdown()

    def test_state_write_failure_does_not_skip_other_scopes_or_finalization(self):
        self.execute_shutdown(fail_state_write=True)


if __name__ == "__main__":
    unittest.main()
