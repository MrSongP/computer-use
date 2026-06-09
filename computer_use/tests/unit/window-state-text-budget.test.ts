import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { compactWindowStateTextForResponse } from "../../src/core/capabilities/capture/get-window-state/text-budget.js";
import type { AccessibilityNode, WindowStateResult } from "../../src/core/contracts/capture.js";

test("compactWindowStateTextForResponse offloads oversized UIA text and returns actionable summary", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "computer-use-uia-budget-"));

  try {
    const largeText = buildLargeAccessibilityTree();
    const state: WindowStateResult = {
      window: {
        id: 101,
        app: "demo.exe",
        rect: { left: 0, top: 0, right: 800, bottom: 600 },
        visible: true,
        minimized: false,
        focused: true
      },
      text: largeText,
      capture: {
        screenshotRequested: false,
        textRequested: true,
        elementsReturned: 121,
        elementsTotal: 121,
        elementsMatched: 121
      }
    };

    const compacted = await compactWindowStateTextForResponse({
      state,
      request: {
        id: "request-one",
        method: "get_window_state",
        params: {
          window: { id: 101, app: "demo.exe" },
          include_screenshot: false,
          include_text: true
        },
        meta: {
          codexTurnMetadata: {
            session_id: "session-alpha",
            turn_id: "turn-beta"
          }
        }
      },
      outputDir,
      textCharBudget: 1000,
      summaryNodeLimit: 10
    });

    assert.equal(compacted.capture.textOmitted, true);
    assert.equal(compacted.capture.textSummary?.mode, "actionable_nodes");
    assert.equal(compacted.capture.textSummary?.maxSummaryNodes, 10);
    assert.equal(compacted.text?.children.length, 10);
    assert.equal(compacted.text?.children.every((node) => node.patterns?.includes("InvokePattern")), true);
    assert.equal(typeof compacted.capture.textArtifactPath, "string");

    const artifact = JSON.parse(await readFile(compacted.capture.textArtifactPath!, "utf8"));
    assert.equal(artifact.children.length, largeText.children.length);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("compactWindowStateTextForResponse leaves small UIA text inline", async () => {
  const state: WindowStateResult = {
    window: {
      id: 101,
      app: "demo.exe",
      rect: { left: 0, top: 0, right: 800, bottom: 600 },
      visible: true,
      minimized: false,
      focused: true
    },
    text: {
      index: 0,
      role: "Window",
      name: "Demo",
      children: []
    },
    capture: {
      screenshotRequested: false,
      textRequested: true
    }
  };

  const compacted = await compactWindowStateTextForResponse({
    state,
    request: {
      id: "request-two",
      method: "get_window_state",
      params: { window: { id: 101, app: "demo.exe" } }
    },
    textCharBudget: 1000
  });

  assert.equal(compacted, state);
});

function buildLargeAccessibilityTree(): AccessibilityNode {
  return {
    index: 0,
    role: "Window",
    name: "Demo Window",
    children: Array.from({ length: 120 }, (_, index) => ({
      index: index + 1,
      role: "Button",
      name: `Button ${index} ${"long label ".repeat(20)}`,
      bounds: { left: index, top: index, right: index + 10, bottom: index + 10 },
      enabled: true,
      offscreen: false,
      patterns: ["InvokePattern"],
      secondaryActions: ["invoke"],
      children: []
    }))
  };
}
