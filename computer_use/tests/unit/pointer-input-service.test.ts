import test from "node:test";
import assert from "node:assert/strict";
import type { WindowRef } from "../../src/core/contracts/window.js";
import { WindowActivationService } from "../../src/windows/activation/window-activator.js";
import {
  PointerInputService,
  normalizeClickParams,
  toPointerClick,
  toPointerDrag,
  toPointerScroll
} from "../../src/windows/input/pointer-input-service.js";
import type { PointerClick, PointerDrag, PointerScroll } from "../../src/windows/shared/win32-types.js";

const windowWithRect: WindowRef = {
  id: 101,
  app: "demo.exe",
  rect: { left: 100, top: 200, right: 500, bottom: 700 }
};

test("normalizeClickParams fills defaults and canonicalizes button aliases", () => {
  assert.deepEqual(
    normalizeClickParams({
      window: { id: 101, app: "demo.exe" },
      x: 10,
      y: 20,
      mouse_button: "r"
    }),
    {
      window: { id: 101, app: "demo.exe" },
      x: 10,
      y: 20,
      click_count: 1,
      mouse_button: "right"
    }
  );
});

test("toPointerClick converts window-relative coordinates when rect is available", () => {
  assert.deepEqual(
    toPointerClick({
      window: windowWithRect,
      x: 10,
      y: 20,
      click_count: 2,
      mouse_button: "middle"
    }),
    {
      x: 110,
      y: 220,
      button: "middle",
      clickCount: 2
    }
  );
});

test("toPointerScroll and toPointerDrag convert window-relative coordinates when rect is available", () => {
  assert.deepEqual(
    toPointerScroll({
      window: windowWithRect,
      x: 10,
      y: 20,
      scroll_y: -2
    }),
    {
      x: 110,
      y: 220,
      scrollX: 0,
      scrollY: -2
    }
  );

  assert.deepEqual(
    toPointerDrag({
      window: windowWithRect,
      from_x: 10,
      from_y: 20,
      to_x: 30,
      to_y: 40
    }),
    {
      fromX: 110,
      fromY: 220,
      toX: 130,
      toY: 240,
      button: "left",
      durationMs: 250,
      steps: 12
    }
  );
});

test("pointer primitives preserve raw coordinates when no window rect is available", () => {
  assert.deepEqual(
    toPointerClick({
      window: { id: 101, app: "demo.exe" },
      x: 10,
      y: 20
    }),
    {
      x: 10,
      y: 20,
      button: "left",
      clickCount: 1
    }
  );
});

test("PointerInputService activates the window before forwarding the normalized click", async () => {
  const steps: string[] = [];
  const recordedWindows: WindowRef[] = [];
  const recordedClicks: PointerClick[] = [];
  const activationService = new WindowActivationService({
    async activateWindow(window) {
      steps.push("activate");
      recordedWindows.push(window);
    }
  });
  const service = new PointerInputService(activationService, {
    async sendPointerClick(click) {
      steps.push("click");
      recordedClicks.push(click);
    }
  });

  const execution = await service.click({
    window: windowWithRect,
    x: 10,
    y: 20,
    mouse_button: "m",
    click_count: 2
  });

  assert.deepEqual(steps, ["activate", "click"]);
  assert.deepEqual(recordedWindows, [windowWithRect]);
  assert.deepEqual(recordedClicks, [
    {
      x: 110,
      y: 220,
      button: "middle",
      clickCount: 2
    }
  ]);
  assert.equal(execution.activation.strategy.maxForegroundRetries, 20);
  assert.equal(execution.activation.strategy.attachThreadInputMode, "unavailable");
  assert.deepEqual(execution.clickPlan.coordinates, {
    pixelX: 110,
    pixelY: 220,
    absoluteX: 3757,
    absoluteY: 13362
  });
  assert.equal(execution.clickPlan.reservedPrimitives.scroll.kind, "scroll");
  assert.equal(execution.clickPlan.reservedPrimitives.drag.kind, "drag");
});

test("PointerInputService activates before scroll and drag primitives", async () => {
  const steps: string[] = [];
  const recordedScrolls: PointerScroll[] = [];
  const recordedDrags: PointerDrag[] = [];
  const activationService = new WindowActivationService({
    async activateWindow() {
      steps.push("activate");
    }
  });
  const service = new PointerInputService(activationService, {
    async sendPointerClick() {
      throw new Error("not used");
    },
    async sendPointerScroll(scroll) {
      steps.push("scroll");
      recordedScrolls.push(scroll);
    },
    async sendPointerDrag(drag) {
      steps.push("drag");
      recordedDrags.push(drag);
    }
  });

  await service.scroll({
    window: windowWithRect,
    x: 10,
    y: 20,
    scroll_x: 1
  });
  await service.drag({
    window: windowWithRect,
    from_x: 10,
    from_y: 20,
    to_x: 30,
    to_y: 40,
    steps: 3,
    duration_ms: 90
  });

  assert.deepEqual(steps, ["activate", "scroll", "activate", "drag"]);
  assert.deepEqual(recordedScrolls, [{ x: 110, y: 220, scrollX: 1, scrollY: 0 }]);
  assert.deepEqual(recordedDrags, [
    {
      fromX: 110,
      fromY: 220,
      toX: 130,
      toY: 240,
      button: "left",
      durationMs: 90,
      steps: 3
    }
  ]);
});
