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
