import test from "node:test";
import assert from "node:assert/strict";
import { validateWindowStateParams } from "../../src/core/capabilities/capture/get-window-state/contract.js";

test("validateWindowStateParams accepts accessibility filters", () => {
  assert.deepEqual(
    validateWindowStateParams({
      window: { id: 42, app: "demo.exe" },
      include_text: true,
      include_screenshot: false,
      max_elements: 12,
      role_filter: [" Edit ", "Button"],
      name_contains: " input "
    }),
    {
      window: { id: 42, app: "demo.exe" },
      include_text: true,
      include_screenshot: false,
      jpeg_quality: undefined,
      max_elements: 12,
      role_filter: ["Edit", "Button"],
      name_contains: "input"
    }
  );
});

test("validateWindowStateParams rejects malformed accessibility filters", () => {
  assert.throws(
    () => validateWindowStateParams({
      window: { id: 42, app: "demo.exe" },
      role_filter: ["Edit", ""]
    }),
    /role_filter/
  );
  assert.throws(
    () => validateWindowStateParams({
      window: { id: 42, app: "demo.exe" },
      name_contains: " "
    }),
    /name_contains/
  );
});
