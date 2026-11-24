"""Explicit physical challenge acquisition selection; old condition grammar unchanged."""

from .lifecycle import RECIPES

PREFIX = "engineering-n11-physical-challenge-"


def physical_challenge_mode(mode):
    if type(mode) is not str or not mode.startswith(PREFIX):
        return None
    recipe = mode[len(PREFIX) :]
    return recipe if recipe in RECIPES else None
