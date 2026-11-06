"""Closed condition-mode selection; never grants collection or dispatch authority."""

import re


def condition_mode(mode):
    if type(mode) is not str:
        return None
    match = re.fullmatch(
        r"engineering-n11-(resource-)?condition-(no_injected_fault|owned_identity_delay|owned_cpu_pressure)",
        mode,
    )
    return None if match is None else dict(condition=match.group(2), resource=bool(match.group(1)))


def condition_observer_class(resource):
    if type(resource) is not bool:
        raise ValueError("typed resource mode required")
    if resource:
        from .contained_condition import ResourceConditionObservation

        return ResourceConditionObservation
    from condition_observation import ConditionObservation

    return ConditionObservation
