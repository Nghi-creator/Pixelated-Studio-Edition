"""Closed engineering fixture conditions; these names are not diagnostic labels."""
CONDITIONS=('no_injected_fault','owned_identity_delay','owned_cpu_pressure')
METHOD='n11-contained-condition-witness-v1'
OWNED_METHOD='n11-owned-condition-pacing-v1'


def condition_variant(condition):
    if type(condition) is not str or condition not in CONDITIONS:
        raise ValueError('closed condition required')
    return dict(method=METHOD,owned_method=OWNED_METHOD,
                delay_us=34000 if condition=='owned_identity_delay' else 0,
                pressure_workers=2 if condition=='owned_cpu_pressure' else 0)
