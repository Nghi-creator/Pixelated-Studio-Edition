#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${PIXELATED_CAPTURE_ROM_PATH:-}" ]]; then
  echo "PIXELATED_CAPTURE_ROM_PATH is required" >&2
  exit 1
fi

if [[ -z "${PIXELATED_CAPTURE_OUTPUT_PATH:-}" ]]; then
  echo "PIXELATED_CAPTURE_OUTPUT_PATH is required" >&2
  exit 1
fi

runtime_id="${PIXELATED_CAPTURE_RUNTIME_ID:-mesen}"
engine_image="${PIXELATED_ENGINE_IMAGE:-pixelated-engine}"
delay_seconds="${PIXELATED_CAPTURE_DELAY_SECONDS:-8}"
input_seconds="${PIXELATED_CAPTURE_INPUT_SECONDS:-3}"
send_input="${PIXELATED_CAPTURE_SEND_INPUT:-0}"
rom_path="$(cd "$(dirname "${PIXELATED_CAPTURE_ROM_PATH}")" && pwd)/$(basename "${PIXELATED_CAPTURE_ROM_PATH}")"
rom_extension="${rom_path##*.}"
if [[ "${rom_extension}" == "${rom_path}" ]]; then
  rom_extension="rom"
fi
output_dir="$(mkdir -p "$(dirname "${PIXELATED_CAPTURE_OUTPUT_PATH}")" && cd "$(dirname "${PIXELATED_CAPTURE_OUTPUT_PATH}")" && pwd)"
output_file="$(basename "${PIXELATED_CAPTURE_OUTPUT_PATH}")"

case "${runtime_id}" in
  mesen)
    core_path="/cores/mesen_libretro.so"
    ;;
  mgba)
    core_path="/cores/mgba_libretro.so"
    ;;
  bsnes)
    core_path="/cores/bsnes_libretro.so"
    ;;
  picodrive)
    core_path="/cores/picodrive_libretro.so"
    ;;
  *)
    echo "Unsupported runtime for screenshot capture: ${runtime_id}" >&2
    exit 1
    ;;
esac

docker run --rm \
  -e "CAPTURE_CORE_PATH=${core_path}" \
  -e "CAPTURE_DELAY_SECONDS=${delay_seconds}" \
  -e "CAPTURE_INPUT_SECONDS=${input_seconds}" \
  -e "CAPTURE_INPUT_FILE=input.${rom_extension}" \
  -e "CAPTURE_OUTPUT_FILE=${output_file}" \
  -e "CAPTURE_SEND_INPUT=${send_input}" \
  -v "${rom_path}:/capture/input.${rom_extension}:ro" \
  -v "${output_dir}:/capture-output" \
  "${engine_image}" \
  bash -lc '
    set -euo pipefail
    export DISPLAY=:99
    export LIBGL_ALWAYS_SOFTWARE=1
    export SDL_VIDEODRIVER=x11
    rm -f /tmp/.X99-lock
    rm -rf /tmp/.X11-unix/X99

    Xvfb :99 -screen 0 640x480x24 >/tmp/xvfb.log 2>&1 &
    xvfb_pid="$!"
    trap "kill ${retroarch_pid:-} ${xvfb_pid:-} >/dev/null 2>&1 || true" EXIT
    sleep 0.5

    cat > /tmp/retroarch-capture.cfg <<EOF
video_vsync = "false"
video_smooth = "false"
audio_driver = "null"
video_driver = "gl"
input_driver = "udev"
joypad_driver = "udev"
EOF

    if [[ ! -f "${CAPTURE_CORE_PATH}" ]]; then
      echo "Missing libretro core inside ${PIXELATED_ENGINE_IMAGE:-pixelated-engine}: ${CAPTURE_CORE_PATH}" >&2
      echo "Rebuild the engine image from engine/runtime before capture." >&2
      exit 1
    fi

retroarch --verbose -f -L "${CAPTURE_CORE_PATH}" --appendconfig /tmp/retroarch-capture.cfg "/capture/${CAPTURE_INPUT_FILE}" >/tmp/retroarch.log 2>&1 &
    retroarch_pid="$!"

    for _ in $(seq 1 60); do
      if xdotool search --onlyvisible --class retroarch >/tmp/retroarch-window.txt 2>/dev/null || \
        xdotool search --onlyvisible --name RetroArch >/tmp/retroarch-window.txt 2>/dev/null; then
        break
      fi
      sleep 0.5
    done

    if [[ ! -s /tmp/retroarch-window.txt ]]; then
      echo "RetroArch did not open a visible window." >&2
      echo "--- retroarch.log ---" >&2
      cat /tmp/retroarch.log >&2 || true
      echo "--- xvfb.log ---" >&2
      cat /tmp/xvfb.log >&2 || true
      exit 1
    fi

    sleep 2
    xdotool windowactivate "$(head -n 1 /tmp/retroarch-window.txt)" >/dev/null 2>&1 || true
    if [[ "${CAPTURE_SEND_INPUT}" != "0" ]]; then
      for _ in $(seq 1 "${CAPTURE_INPUT_SECONDS}"); do
        xdotool key Return >/dev/null 2>&1 || true
        xdotool key space >/dev/null 2>&1 || true
        xdotool key z >/dev/null 2>&1 || true
        xdotool key x >/dev/null 2>&1 || true
        sleep 1
      done
    fi
    sleep "${CAPTURE_DELAY_SECONDS}"

    gst-launch-1.0 -q \
      ximagesrc display-name=:99 use-damage=0 show-pointer=false num-buffers=1 \
      ! video/x-raw,framerate=1/1 \
      ! videoconvert \
      ! pngenc \
      ! filesink location="/capture-output/${CAPTURE_OUTPUT_FILE}"

    test -s "/capture-output/${CAPTURE_OUTPUT_FILE}"
  '
