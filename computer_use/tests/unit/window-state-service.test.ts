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
