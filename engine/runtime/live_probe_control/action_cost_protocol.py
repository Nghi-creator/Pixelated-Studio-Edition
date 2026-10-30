"""Versioned acquisition constants, not a qualified live policy or cost budget."""

METHOD = "n10-contained-game-action-cost-acquisition-v1"
MODES = {
    "engineering-game-unchanged-cost": "unchanged",
    "engineering-game-action-cost": "action",
}
SCHEDULE = {
    "baseline": 3000000000,
    "boundary": 6000000000,
    "during": 7000000000,
    "restored": 14000000000,
}
PHASES = ("baseline", "during", "restored")
LATE_NS = 150000000
UNMEASURED_COST_SCOPES = ("pulse", "lease_guard", "watchdog_child", "startup")

METHOD_V2 = "n10-contained-game-action-cost-acquisition-v2"
SCHEDULE_V2 = {**SCHEDULE, "during": 8000000000}
MODES_V2 = {mode + "-v2": condition for mode, condition in MODES.items()}


def versioned_protocol(version):
    if version == "v1":
        return METHOD, SCHEDULE, MODES
    if version == "v2":
        return METHOD_V2, SCHEDULE_V2, MODES_V2
    if version == "v3":
        return METHOD_V3, SCHEDULE_V2, MODES_V3
    raise ValueError("closed action-cost protocol version required")


METHOD_V3 = "n10-contained-game-action-cost-acquisition-v3"
MODES_V3 = {
    "engineering-game-unchanged-span": "unchanged",
    "engineering-game-action-span": "action",
    "engineering-game-action-span-failure": "action",
}
