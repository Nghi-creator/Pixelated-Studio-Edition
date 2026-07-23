import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STREAM_KEYBOARD_MAPPING,
  formatKeyboardCode,
  parseStreamKeyboardMapping,
  rebindStreamKeyboard,
  streamActionForCode,
} from "../../../src/lib/webrtc/inputMappings.ts";

test("stream keyboard mappings parse valid preferences and reject invalid ones", () => {
  const customized = {
    ...DEFAULT_STREAM_KEYBOARD_MAPPING,
    face_east: "KeyQ",
  };

  assert.deepEqual(
    parseStreamKeyboardMapping(JSON.stringify(customized)),
    customized,
  );
  assert.deepEqual(
    parseStreamKeyboardMapping('{"dpad_up":"ArrowUp"}'),
    DEFAULT_STREAM_KEYBOARD_MAPPING,
  );
  assert.deepEqual(
    parseStreamKeyboardMapping("not-json"),
    DEFAULT_STREAM_KEYBOARD_MAPPING,
  );
});

test("stream keyboard mappings reject duplicate bindings", () => {
  assert.throws(
    () =>
      rebindStreamKeyboard(
        DEFAULT_STREAM_KEYBOARD_MAPPING,
        "face_east",
        "KeyZ",
      ),
    /already assigned to B/,
  );
});

test("stream keyboard mappings resolve canonical actions and readable labels", () => {
  const customized = rebindStreamKeyboard(
    DEFAULT_STREAM_KEYBOARD_MAPPING,
    "face_east",
    "KeyQ",
  );

  assert.equal(streamActionForCode(customized, "KeyQ"), "face_east");
  assert.equal(streamActionForCode(customized, "KeyX"), null);
  assert.equal(formatKeyboardCode("ArrowLeft"), "←");
  assert.equal(formatKeyboardCode("KeyQ"), "Q");
});
