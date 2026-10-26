"""Execute actual camera teardown code without importing GI or starting a server."""

import ast
import types
import unittest
from pathlib import Path


class LifecycleTests(unittest.TestCase):
    def test_retired_pipeline_bus_error_cannot_fail_or_close_replacement(self):
        tree = ast.parse((Path(__file__).resolve().parents[2] / "camera.py").read_text())
        callback = next(node for node in ast.walk(tree)
                        if isinstance(node, ast.FunctionDef) and node.name == "on_bus_message")
        pipeline, replacement = object(), object()
        errors, retired = [], []
        namespace = {
            "pipeline": pipeline, "peer_id": "peer", "peers": {"peer": {"pipeline": replacement}},
            "Gst": types.SimpleNamespace(MessageType=types.SimpleNamespace(ERROR="error", WARNING="warning")),
            "emit_engine_error": lambda message, peer_id: errors.append((message, peer_id)),
            "cleanup_peer": lambda peer_id, reason: retired.append((peer_id, reason)),
        }
        exec(  # noqa: S102 -- actual local callback, no GI startup
            compile(ast.Module(body=[callback], type_ignores=[]), "trusted-bus-callback", "exec"), namespace)
        message = types.SimpleNamespace(type="error", parse_error=lambda: (types.SimpleNamespace(message="lost"), None))
        namespace["on_bus_message"](None, message)
        self.assertEqual((errors, retired), ([], []))
        namespace["peers"]["peer"]["pipeline"] = pipeline
        namespace["on_bus_message"](None, message)
        self.assertEqual(errors, [("GStreamer error for peer peer: lost", "peer")])
        self.assertEqual(retired, [("peer", "source_error")])

    def test_camera_error_payload_contains_structured_peer_scope(self):
        tree = ast.parse((Path(__file__).resolve().parents[2] / "camera.py").read_text())
        emitter = next(node for node in tree.body
                       if isinstance(node, ast.FunctionDef) and node.name == "emit_engine_error")
        events = []
        namespace = {"SESSION_ID": "session", "sio": types.SimpleNamespace(emit=lambda *args: events.append(args))}
        exec(  # noqa: S102 -- actual local emitter, no socket client startup
            compile(ast.Module(body=[emitter], type_ignores=[]), "trusted-error-emitter", "exec"), namespace)
        namespace["emit_engine_error"]("worker lost", "failed")
        self.assertEqual(events, [("engine-error", {
            "sessionId": "session", "peerId": "failed", "source": "camera", "message": "worker lost",
        })])

    def test_campaign_close_failure_never_skips_camera_teardown(self):
        self.execute_shutdown(fail_campaign_close=True)

    def execute_shutdown(self, fail_state_write=False, fail_campaign_close=False):
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
            "campaign_service": None,
            "RECEIVERS": None,
            "WORKERS": None,
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
        if fail_campaign_close:
            def failed_close():
                raise RuntimeError("private diagnostic")
            namespace["campaign_service"] = types.SimpleNamespace(close=failed_close)
        module = ast.Module(body=[cleanup, loop_try], type_ignores=[])
        with self.assertRaises(RuntimeError if fail_campaign_close else KeyboardInterrupt):
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
