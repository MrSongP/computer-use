import test from "node:test";
import assert from "node:assert/strict";
import type { WindowRef } from "../../src/core/contracts/window.js";
import { WindowActivationService } from "../../src/windows/activation/window-activator.js";
import {
  CoordinatesOutsideVirtualScreenError,
  CoordinatesOutsideWindowError,
  MissingScreenshotCoordinateMetadataError,
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

test("toPointerClick converts screenshot pixels through the screenshot window region and scale", () => {
  assert.deepEqual(
    toPointerClick({
      window: {
        ...windowWithRect,
        screenshotWindowRegion: { left: 25, top: 50, right: 225, bottom: 250 },
        screenshotCoordinateScale: { x: 2, y: 4 }
      },
      coordinateSpace: "screenshot",
      x: 10,
      y: 20
    }),
    {
      x: 145,
      y: 330,
      button: "left",
      clickCount: 1
    }
  );
});

test("toPointerClick rejects screenshot coordinates without snapshot metadata", () => {
  assert.throws(
    () => toPointerClick({
      window: { id: 101, app: "demo.exe" },
      coordinateSpace: "screenshot",
      x: 10,
      y: 20
    }),
    MissingScreenshotCoordinateMetadataError
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
  assert.equal(execution.activation.plan.strategy.maxForegroundRetries, 20);
  assert.equal(execution.activation.plan.strategy.attachThreadInputMode, "unavailable");
  assert.deepEqual(execution.clickPlan.coordinates, {
    pixelX: 110,
    pixelY: 220,
    absoluteX: 3757,
    absoluteY: 13362
  });
  assert.deepEqual(execution.clickPlan.virtualScreen, {
    originX: 0,
    originY: 0,
    width: 1920,
    height: 1080,
    source: "default"
  });
  assert.equal(execution.clickPlan.reservedPrimitives.scroll.kind, "scroll");
  assert.equal(execution.clickPlan.reservedPrimitives.drag.kind, "drag");
});

test("PointerInputService preserves negative-screen clicks when native virtual metrics include the monitor", async () => {
  const recordedClicks: PointerClick[] = [];
  const secondaryMonitorWindow: WindowRef = {
    id: 202,
    app: "qq.exe",
    rect: { left: -2167, top: 300, right: -719, bottom: 1371 }
  };
  const activationService = new WindowActivationService({
    async activateWindow(window) {
      return {
        ok: true,
        window,
        focused: true,
        focusedSource: "GetForegroundWindow",
        foregroundWindowId: window.id
      };
    }
  });
  const service = new PointerInputService(activationService, {
    async getVirtualScreenMetrics() {
      return {
        originX: -2560,
        originY: 0,
        width: 4480,
        height: 1440,
        source: "native"
      };
    },
    async sendPointerClick(click) {
      recordedClicks.push(click);
      return {
        postInputFocus: {
          focused: true,
          matchesTarget: true,
          foregroundWindowId: secondaryMonitorWindow.id
        },
        hitTest: {
          hwndAtPoint: secondaryMonitorWindow.id,
          matchesTarget: true
        }
      };
    }
  });

  const execution = await service.click({
    window: secondaryMonitorWindow,
    x: 175,
    y: 275
  });

  assert.deepEqual(recordedClicks, [
    {
      x: -1992,
      y: 575,
      button: "left",
      clickCount: 1
    }
  ]);
  assert.deepEqual(execution.clickPlan.coordinates, {
    pixelX: -1992,
    pixelY: 575,
    absoluteX: 8311,
    absoluteY: 26187
  });
  assert.equal(execution.feedback?.hitTest?.matchesTarget, true);
});

test("PointerInputService rejects negative-screen clicks when virtual metrics do not include that monitor", async () => {
  const secondaryMonitorWindow: WindowRef = {
    id: 202,
    app: "qq.exe",
    rect: { left: -2167, top: 300, right: -719, bottom: 1371 }
  };
  const activationService = new WindowActivationService({
    async activateWindow() {}
  });
  const service = new PointerInputService(activationService, {
    async sendPointerClick() {
      throw new Error("must not send unsafe click");
    }
  });

  await assert.rejects(
    () => service.click({
      window: secondaryMonitorWindow,
      x: 175,
      y: 275
    }),
    (error: unknown) => {
      assert.equal(error instanceof CoordinatesOutsideVirtualScreenError, true);
      const details = (error as CoordinatesOutsideVirtualScreenError).details;
      assert.equal(details.failureClass, "offscreen_window_region");
      assert.deepEqual(details.targetWindowRect, secondaryMonitorWindow.rect);
      assert.deepEqual(details.requestedWindowRelativeCoordinate, { x: 175, y: 275 });
      assert.deepEqual(details.computedScreenCoordinate, { x: -1992, y: 575 });
      assert.ok(Array.isArray(details.recoveryHints));
      return true;
    }
  );
});

test("toPointerClick rejects coordinates outside the carried window rect", () => {
  assert.throws(
    () => toPointerClick({
      window: windowWithRect,
      x: 401,
      y: 20
    }),
    CoordinatesOutsideWindowError
  );
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
