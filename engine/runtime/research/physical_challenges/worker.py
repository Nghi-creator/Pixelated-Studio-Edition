"""Explicit fixture peer wrapper; ordinary PeerMedia/peer wire messages are unchanged."""

import secrets
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import patch

from .channel import ChallengeFileService, OwnedDirectory
from .lifecycle import RECIPES, ChallengeLifecycle
from .peer import ChallengeEndpoint


def close_challenge_media(media, original_close):
    if getattr(media, "_challenge_close_ok", False) is True:
        return True
    if getattr(media, "_challenge_closing", False):
        return False
    media._challenge_closing = True
    ok, closed, interrupt = True, False, None
    try:
        try:
            if hasattr(media, "_challenge_endpoint"):
                ok = media._challenge_endpoint.lifecycle.close()
                if hasattr(media, "_challenge_service"):
                    media._challenge_service.publish()
        except BaseException as error:
            ok = False
            if not isinstance(error, Exception):
                interrupt = error
        finally:
            try:
                closed = original_close(media)
            finally:
                if hasattr(media, "_challenge_service"):
                    media._challenge_service.close()
                if hasattr(media, "_challenge_directory"):
                    media._challenge_directory.close()
    finally:
        media._challenge_closing = False
        media._challenge_close_ok = bool(ok and closed)
    if interrupt is not None:
        raise interrupt
    return media._challenge_close_ok


def peer_subprocess_proxy(recipe):
    if type(recipe) is not str or recipe not in RECIPES:
        raise ValueError("closed challenge recipe required")
    original = subprocess.Popen

    def launch(argv, **kwargs):
        if argv != [
            sys.executable,
            "-u",
            "-m",
            "research.live_probe_control.peers.peer_worker",
            "--dedicated-peer-worker",
        ]:
            raise ValueError("exact dedicated fixture peer required")
        code = (
            "from research.physical_challenges.worker import child_main;"
            "raise SystemExit(child_main(" + repr(recipe) + "))"
        )
        return original([sys.executable, "-u", "-c", code, "--dedicated-peer-worker"], **kwargs)

    return SimpleNamespace(
        Popen=launch, PIPE=subprocess.PIPE, TimeoutExpired=subprocess.TimeoutExpired
    )


def child_main(recipe):
    if (
        type(recipe) is not str
        or recipe not in RECIPES
        or sys.argv[1:] != ["--dedicated-peer-worker"]
    ):
        raise ValueError("explicit challenge peer required")
    from research.live_probe_control.control.probe_transport import EngineeringControl
    from research.live_probe_control.peers import peer_worker

    original_init, original_poll, original_close = (
        peer_worker.PeerMedia.__init__,
        peer_worker.PeerMedia.poll,
        peer_worker.PeerMedia.close,
    )

    def initialize(media, bootstrap, emit):
        original_init(media, bootstrap, emit)
        if bootstrap["body"]["source"] != "isolated_game" or media.capture_lease is None:
            raise ValueError("owned isolated source required")
        config = EngineeringControl.from_wire(bootstrap["body"]["control"])
        if not config.matches_source("isolated_game"):
            raise ValueError("owned isolated control binding required")
        directory = OwnedDirectory(config.directory, (config.device, config.inode))
        media._challenge_directory = directory
        element = media.pipeline.get_by_name("captured")
        if (
            element is None
            or element.get_factory().get_name() != "identity"
            or element.get_property("sync")
            or element.get_property("drop-probability") != 0
        ):
            raise ValueError("idle fixture identity required")

        def owns():
            return (
                not media.closed
                and media.pipeline.get_by_name("captured") == element
                and media.capture_lease.healthy(force=True)
            )

        lifecycle = ChallengeLifecycle(
            element,
            generation=bootstrap["generation"],
            current_generation=lambda: media.bootstrap["generation"],
            owns=owns,
        )
        media._challenge_endpoint = ChallengeEndpoint(lifecycle, recipe, secrets.token_hex(32))
        media._challenge_service = ChallengeFileService(
            media._challenge_endpoint, directory, asynchronous=True
        )

    def poll(media):
        original_poll(media)
        media._challenge_service.poll()

    def close(media):
        return close_challenge_media(media, original_close)

    with (
        patch.object(peer_worker.PeerMedia, "__init__", initialize),
        patch.object(peer_worker.PeerMedia, "poll", poll),
        patch.object(peer_worker.PeerMedia, "close", close),
    ):
        return peer_worker.main()
