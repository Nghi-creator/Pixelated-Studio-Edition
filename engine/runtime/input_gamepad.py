import json
import sys

try:
    from evdev import AbsInfo, UInput, ecodes as e
except Exception as exc:
    print(f"[Gamepad] evdev unavailable: {exc}", flush=True)
    sys.exit(1)


BUTTON_CODES = {
    "a": e.BTN_EAST,
    "b": e.BTN_SOUTH,
    "down": e.BTN_DPAD_DOWN,
    "l": e.BTN_TL,
    "left": e.BTN_DPAD_LEFT,
    "r": e.BTN_TR,
    "right": e.BTN_DPAD_RIGHT,
    "select": e.BTN_SELECT,
    "start": e.BTN_START,
    "up": e.BTN_DPAD_UP,
}


def create_gamepad(player_index):
    capabilities = {
        e.EV_KEY: list(BUTTON_CODES.values()),
        e.EV_ABS: [
            (e.ABS_X, AbsInfo(0, -32768, 32767, 0, 0, 0)),
            (e.ABS_Y, AbsInfo(0, -32768, 32767, 0, 0, 0)),
        ],
    }
    return UInput(
        capabilities,
        name=f"Pixelated Virtual Gamepad P{player_index}",
        version=0x3,
    )


def main():
    gamepads = {player_index: create_gamepad(player_index) for player_index in range(1, 5)}
    print("[Gamepad] ready", flush=True)

    for line in sys.stdin:
        try:
            payload = json.loads(line)
            player_index = int(payload.get("playerIndex"))
            button = payload.get("button")
            action = payload.get("action")
            code = BUTTON_CODES.get(button)
            gamepad = gamepads.get(player_index)

            if not gamepad or not code or action not in ["keydown", "keyup"]:
                continue

            gamepad.write(e.EV_KEY, code, 1 if action == "keydown" else 0)
            gamepad.syn()
        except Exception as exc:
            print(f"[Gamepad] input error: {exc}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[Gamepad] failed: {exc}", flush=True)
        sys.exit(1)
