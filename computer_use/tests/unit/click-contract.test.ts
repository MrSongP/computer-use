import test from "node:test";
import assert from "node:assert/strict";
import { validateClickParams } from "../../src/core/capabilities/actions/click/contract.js";

const windowRef = { id: 101, app: "demo.exe" } as const;
const snapshotWindowRef = {
  ...windowRef,
  rect: { left: 10, top: 20, right: 210, bottom: 220 },
  screenshotWindowRegion: { left: 0, top: 0, right: 200, bottom: 200 },
  screenshotCoordinateScale: { x: 1, y: 1 }
} as const;

test("validateClickParams accepts coordinate mode", () => {
  assert.deepEqual(
    validateClickParams({
      window: snapshotWindowRef,
      x: 12,
      y: 34,
      coordinateSpace: "screenshot"
    }),
    {
      window: snapshotWindowRef,
      x: 12,
      y: 34,
      coordinateSpace: "screenshot"
    }
  );
});

test("validateClickParams rejects screenshot coordinates without snapshot metadata", () => {
  assert.throws(
    () => validateClickParams({
      window: windowRef,
      x: 12,
      y: 34,
      coordinateSpace: "screenshot"
    }),
    /requires the exact state\.window/
  );
});

test("validateClickParams rejects malformed coordinateSpace", () => {
  assert.throws(
    () => validateClickParams({
      window: windowRef,
      x: 12,
      y: 34,
      coordinateSpace: "screen"
    } as any),
    /coordinateSpace/
  );
});

test("validateClickParams rejects element_index because semantic clicks must use click_element", () => {
  const invalidParams = {
    window: windowRef,
    x: 12,
    y: 34,
    element_index: 7
  } as unknown as Parameters<typeof validateClickParams>[0];

  assert.throws(
    () => validateClickParams(invalidParams),
    /unsupported fields: element_index/
  );
});
