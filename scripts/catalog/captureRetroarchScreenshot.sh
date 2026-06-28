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
delay_seconds="${PIXELATED_CAPTURE_DELAY_SECONDS:-6}"
rom_path="$(cd "$(dirname "${PIXELATED_CAPTURE_ROM_PATH}")" && pwd)/$(basename "${PIXELATED_CAPTURE_ROM_PATH}")"
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
  -e "CAPTURE_OUTPUT_FILE=${output_file}" \
  -v "${rom_path}:/capture/input.rom:ro" \
  -v "${output_dir}:/capture-output" \
  "${engine_image}" \
  bash -lc '
    set -euo pipefail
    export DISPLAY=:99
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
input_driver = "udev"
joypad_driver = "udev"
EOF

    retroarch -f -L "${CAPTURE_CORE_PATH}" --appendconfig /tmp/retroarch-capture.cfg /capture/input.rom >/tmp/retroarch.log 2>&1 &
    retroarch_pid="$!"

    sleep "${CAPTURE_DELAY_SECONDS}"
    xdotool key Return >/dev/null 2>&1 || true
    xdotool key space >/dev/null 2>&1 || true
    sleep 1

    gst-launch-1.0 -q \
      ximagesrc display-name=:99 use-damage=0 num-buffers=1 \
      ! video/x-raw,framerate=1/1 \
      ! videoconvert \
      ! pngenc \
      ! filesink location="/capture-output/${CAPTURE_OUTPUT_FILE}"

    test -s "/capture-output/${CAPTURE_OUTPUT_FILE}"
  '
