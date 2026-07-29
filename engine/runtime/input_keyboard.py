import ctypes
import ctypes.util
import json
import os
import re
import sys
import time


KEY_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_]+$")
DISPLAY_CONNECT_TIMEOUT_SECONDS = 5


def load_library(name):
    library_path = ctypes.util.find_library(name)
    if not library_path:
        raise RuntimeError(f"{name} library is unavailable")
    return ctypes.cdll.LoadLibrary(library_path)


def configure_x11():
    x11 = load_library("X11")
    xtst = load_library("Xtst")

    x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
    x11.XOpenDisplay.restype = ctypes.c_void_p
    x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
    x11.XCloseDisplay.restype = ctypes.c_int
    x11.XFlush.argtypes = [ctypes.c_void_p]
    x11.XFlush.restype = ctypes.c_int
    x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
    x11.XStringToKeysym.restype = ctypes.c_ulong
    x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    x11.XKeysymToKeycode.restype = ctypes.c_ubyte

    xtst.XTestFakeKeyEvent.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint,
        ctypes.c_int,
        ctypes.c_ulong,
    ]
    xtst.XTestFakeKeyEvent.restype = ctypes.c_int
    return x11, xtst


def connect_display(x11):
    display_name = os.environ.get("DISPLAY", ":99").encode("utf-8")
    deadline = time.monotonic() + DISPLAY_CONNECT_TIMEOUT_SECONDS

    while time.monotonic() < deadline:
        display = x11.XOpenDisplay(display_name)
        if display:
            return display
        time.sleep(0.05)

    raise RuntimeError(
        f"could not connect to X display {display_name.decode('utf-8')}"
    )


def inject_key(x11, xtst, display, action, key_name):
    if action not in ("keydown", "keyup"):
        return
    if not isinstance(key_name, str) or not KEY_NAME_PATTERN.fullmatch(key_name):
        return

    keysym = x11.XStringToKeysym(key_name.encode("ascii"))
    if not keysym:
        return

    keycode = x11.XKeysymToKeycode(display, keysym)
    if not keycode:
        return

    xtst.XTestFakeKeyEvent(display, keycode, action == "keydown", 0)
    x11.XFlush(display)


def main():
    x11, xtst = configure_x11()
    display = connect_display(x11)
    print("[Keyboard] ready", flush=True)

    try:
        for line in sys.stdin:
            try:
                payload = json.loads(line)
                inject_key(
                    x11,
                    xtst,
                    display,
                    payload.get("action"),
                    payload.get("key"),
                )
            except Exception as exc:
                print(f"[Keyboard] input error: {exc}", flush=True)
    finally:
        x11.XCloseDisplay(display)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[Keyboard] failed: {exc}", flush=True)
        sys.exit(1)
