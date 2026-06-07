import test from "node:test";
import assert from "node:assert/strict";
import type { NativeBridge } from "../../src/windows/bridge/native-bridge.js";
import { WindowStateService } from "../../src/windows/capture/window-state-service.js";
import type { WindowStateParams, WindowStateResult } from "../../src/core/contracts/capture.js";

test("window state service enables screenshot and text capture by default", async () => {
  const calls: WindowStateParams[] = [];
  const bridge = {
    async getWindowState(params: WindowStateParams): Promise<WindowStateResult> {
      calls.push(params);
      return {
        window: {
          ...params.window,
          rect: { left: 1, top: 2, right: 3, bottom: 4 },
          visible: true,
          minimized: false,
          focused: true
        },
        capture: {
          screenshotRequested: params.include_screenshot ?? false,
          textRequested: params.include_text ?? false
        }
      };
    }
  } as NativeBridge;

  const service = new WindowStateService(bridge);
  await service.getWindowState({
    window: { id: 101, app: "demo.exe" }
  });

  assert.deepEqual(calls, [
    {
      window: { id: 101, app: "demo.exe" },
      include_screenshot: true,
      include_text: true
    }
  ]);
});

test("window state service forwards accessibility filters and max elements", async () => {
  const calls: WindowStateParams[] = [];
  const bridge = {
    async getWindowState(params: WindowStateParams): Promise<WindowStateResult> {
      calls.push(params);
      return {
        window: {
          ...params.window,
          rect: { left: 1, top: 2, right: 3, bottom: 4 },
          visible: true,
          minimized: false,
          focused: true
        },
        capture: {
          screenshotRequested: params.include_screenshot ?? false,
          textRequested: params.include_text ?? false,
          elementsReturned: 2,
          elementsTotal: 20,
          elementsMatched: 4,
          truncated: true,
          partial: true,
          lastReturnedIndex: 7
        }
      };
    }
  } as NativeBridge;

  const service = new WindowStateService(bridge);
  await service.getWindowState({
    window: { id: 101, app: "demo.exe" },
    include_screenshot: false,
    include_text: true,
    max_elements: 2,
    role_filter: ["Edit", "Button"],
    name_contains: "input"
  });

  assert.deepEqual(calls, [
    {
      window: { id: 101, app: "demo.exe" },
      include_screenshot: false,
      include_text: true,
      max_elements: 2,
      role_filter: ["Edit", "Button"],
      name_contains: "input"
    }
  ]);
});

test("window state service annotates screenshot coordinate mapping and visible region", async () => {
  const bridge = {
    async getVirtualScreenMetrics() {
      return {
        originX: 0,
        originY: 0,
        width: 1920,
        height: 1080,
        source: "native" as const
      };
    },
    async getWindowState(params: WindowStateParams): Promise<WindowStateResult> {
      return {
        window: {
          ...params.window,
          rect: { left: -10, top: 20, right: 90, bottom: 120 },
          visible: true,
          minimized: false,
          focused: true
        },
        screenshot: {
          data: Buffer.from("mock-jpeg").toString("base64"),
          mime: "image/jpeg",
          width: 45,
          height: 100,
          byteLength: 9,
          source: "mock"
        },
        capture: {
          screenshotRequested: true,
          textRequested: false
        }
      };
    }
  } as NativeBridge;

  const service = new WindowStateService(bridge);
  const state = await service.getWindowState({
    window: { id: 101, app: "demo.exe" },
    include_text: false
  });

  assert.deepEqual(state.window.visibleClickableRegion, {
    left: 10,
    top: 0,
    right: 100,
    bottom: 100
  });
  assert.deepEqual(state.window.screenshotCoordinateScale, { x: 2, y: 1 });
  assert.equal(state.screenshot?.coordinateSpace, "screenshot");
  assert.deepEqual(state.screenshot?.coordinateMapping?.origin, {
    windowX: 10,
    windowY: 0,
    screenX: 0,
    screenY: 20
  });
});
