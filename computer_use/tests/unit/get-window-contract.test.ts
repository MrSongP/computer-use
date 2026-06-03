import test from "node:test";
import assert from "node:assert/strict";
import { validateGetWindowContractParams } from "../../src/core/capabilities/discovery/get-window/contract.js";

test("validateGetWindowContractParams accepts top-level id and app", () => {
  assert.deepEqual(
    validateGetWindowContractParams({ id: 42, app: "demo.exe" }),
    { id: 42, app: "demo.exe" }
  );
});

test("validateGetWindowContractParams accepts a nested window object", () => {
  assert.deepEqual(
    validateGetWindowContractParams({
      window: {
        id: 42,
        app: "demo.exe",
        title: "Demo Window"
      }
    } as never),
    { id: 42, app: "demo.exe" }
  );
});

test("validateGetWindowContractParams rejects malformed nested window objects", () => {
  assert.throws(
    () => validateGetWindowContractParams({ window: "bad-window" } as never),
    /valid window object/
  );
});
