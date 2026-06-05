import test from "node:test";
import assert from "node:assert/strict";
import { normalizeKeyChord, parseKeyChord } from "../../src/windows/input/key-parser.js";

test("normalizeKeyChord parses supported chords", () => {
  assert.deepEqual(normalizeKeyChord("Control_L+Shift_L+period"), [
    "Control_L",
    "Shift_L",
    "period"
  ]);
});

test("normalizeKeyChord rejects unsupported keys", () => {
  assert.throws(() => normalizeKeyChord("FakeKey"));
});

test("parseKeyChord marks navigation keys as extended", () => {
  assert.deepEqual(parseKeyChord("Control_L+Right"), {
    keys: [
      { key: "Control_L", vkCode: 0xa2, isExtended: false },
      { key: "Right", vkCode: 0x27, isExtended: true }
    ]
  });
});

test("parseKeyChord expands exclam to shifted number row input", () => {
  assert.deepEqual(parseKeyChord("exclam"), {
    keys: [
      { key: "Shift_L", vkCode: 0xa0, isExtended: false },
      { key: "1", vkCode: 0x31, isExtended: false }
    ]
  });
});

test("parseKeyChord rejects forbidden Windows keys", () => {
  assert.throws(() => parseKeyChord("Meta_L+V"), /Forbidden key/);
});
