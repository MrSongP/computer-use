import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInterruptFilePath,
  hasInterruptMarker,
  removeInterruptMarker,
  writeInterruptMarker
} from "../../src/core/interrupt/interrupt-files.js";

const SAMPLE_TURN = {
  session_id: "session-a",
  turn_id: "turn-b"
} as const;

test("buildInterruptFilePath derives a deterministic interrupt path", () => {
  const result = buildInterruptFilePath("C:\\Users\\tester\\.codex", SAMPLE_TURN);

  assert.match(result, /cache[\\/]computer-use[\\/]interrupts/);
  assert.notEqual(result.includes("session-a"), true);
  assert.notEqual(result.includes("turn-b"), true);
});

test("interrupt markers can be written, detected, and removed", async () => {
  const codexHome = await mkdtemp(path.join(tmpdir(), "computer-use-interrupt-"));

  try {
    assert.equal(hasInterruptMarker(codexHome, SAMPLE_TURN), false);

    const markerPath = await writeInterruptMarker(codexHome, SAMPLE_TURN);
    assert.equal(hasInterruptMarker(codexHome, SAMPLE_TURN), true);
    assert.equal(markerPath, buildInterruptFilePath(codexHome, SAMPLE_TURN));

    await removeInterruptMarker(codexHome, SAMPLE_TURN);
    assert.equal(hasInterruptMarker(codexHome, SAMPLE_TURN), false);
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});
