export const STREAM_INPUT_ACTIONS = [
  "dpad_up",
  "dpad_down",
  "dpad_left",
  "dpad_right",
  "face_east",
  "face_south",
  "shoulder_left",
  "shoulder_right",
  "start",
  "select",
] as const;

export type StreamInputAction = (typeof STREAM_INPUT_ACTIONS)[number];
export type StreamKeyboardMapping = Record<StreamInputAction, string>;

export const STREAM_INPUT_ACTION_LABELS: Record<StreamInputAction, string> = {
  dpad_up: "Up",
  dpad_down: "Down",
  dpad_left: "Left",
  dpad_right: "Right",
  face_east: "A",
  face_south: "B",
  shoulder_left: "L",
  shoulder_right: "R",
  start: "Start",
  select: "Select",
};

export const DEFAULT_STREAM_KEYBOARD_MAPPING: StreamKeyboardMapping = {
  dpad_up: "ArrowUp",
  dpad_down: "ArrowDown",
  dpad_left: "ArrowLeft",
  dpad_right: "ArrowRight",
  face_east: "KeyX",
  face_south: "KeyZ",
  shoulder_left: "KeyA",
  shoulder_right: "KeyS",
  start: "Enter",
  select: "ShiftLeft",
};

export const STREAM_KEYBOARD_MAPPING_STORAGE_KEY =
  "pixelated:studio-keyboard-input:v1";

let cachedMapping: StreamKeyboardMapping | null = null;

export function isValidStreamKeyboardMapping(
  value: unknown,
): value is StreamKeyboardMapping {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const bindings = STREAM_INPUT_ACTIONS.map((action) => candidate[action]);
  return (
    bindings.every(
      (binding) => typeof binding === "string" && binding.length > 0,
    ) && new Set(bindings).size === bindings.length
  );
}

export function parseStreamKeyboardMapping(
  value: string | null,
): StreamKeyboardMapping {
  if (!value) return { ...DEFAULT_STREAM_KEYBOARD_MAPPING };
  try {
    const parsed = JSON.parse(value) as unknown;
    return isValidStreamKeyboardMapping(parsed)
      ? parsed
      : { ...DEFAULT_STREAM_KEYBOARD_MAPPING };
  } catch {
    return { ...DEFAULT_STREAM_KEYBOARD_MAPPING };
  }
}

export function getStreamKeyboardMapping(): StreamKeyboardMapping {
  if (cachedMapping) return cachedMapping;
  cachedMapping = parseStreamKeyboardMapping(
    typeof window === "undefined" || !window.localStorage
      ? null
      : window.localStorage.getItem(STREAM_KEYBOARD_MAPPING_STORAGE_KEY),
  );
  return cachedMapping;
}

export function saveStreamKeyboardMapping(mapping: StreamKeyboardMapping) {
  cachedMapping = { ...mapping };
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(
      STREAM_KEYBOARD_MAPPING_STORAGE_KEY,
      JSON.stringify(cachedMapping),
    );
  }
  return cachedMapping;
}

export function resetStreamKeyboardMapping() {
  return saveStreamKeyboardMapping({ ...DEFAULT_STREAM_KEYBOARD_MAPPING });
}

export function rebindStreamKeyboard(
  mapping: StreamKeyboardMapping,
  action: StreamInputAction,
  code: string,
) {
  if (!code.trim()) throw new Error("Choose a keyboard key.");
  const conflict = STREAM_INPUT_ACTIONS.find(
    (candidate) => candidate !== action && mapping[candidate] === code,
  );
  if (conflict) {
    throw new Error(
      `${formatKeyboardCode(code)} is already assigned to ${STREAM_INPUT_ACTION_LABELS[conflict]}.`,
    );
  }
  return { ...mapping, [action]: code };
}

export function streamActionForCode(
  mapping: StreamKeyboardMapping,
  code: string,
) {
  return (
    STREAM_INPUT_ACTIONS.find((action) => mapping[action] === code) || null
  );
}

export function formatKeyboardCode(code: string) {
  const labels: Record<string, string> = {
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    Enter: "Enter",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    Space: "Space",
  };
  return labels[code] || code.replace(/^Key/, "").replace(/^Digit/, "");
}

export function clearCachedStreamKeyboardMappingForTests() {
  cachedMapping = null;
}
