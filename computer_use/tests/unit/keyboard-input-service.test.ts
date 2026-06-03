import test from "node:test";
import assert from "node:assert/strict";
import type { WindowRef } from "../../src/core/contracts/window.js";
import { WindowActivationService } from "../../src/windows/activation/window-activator.js";
import { KeyboardInputService } from "../../src/windows/input/keyboard-input-service.js";
import type { KeyboardInput } from "../../src/windows/shared/win32-types.js";

test("KeyboardInputService activates the window and emits keydown then reverse keyup inputs", async () => {
  const steps: string[] = [];
  const recordedWindows: WindowRef[] = [];
  const recordedInputs: Array<readonly KeyboardInput[]> = [];
  const activationService = new WindowActivationService({
    async activateWindow(window) {
      steps.push("activate");
      recordedWindows.push(window);
    }
  });
  const service = new KeyboardInputService(activationService, {
    async sendKeyboardInputs(inputs) {
      steps.push("send");
      recordedInputs.push([...inputs]);
    }
  });

  await service.pressKey({
    window: { id: 101, app: "demo.exe" },
    key: "Control_L+Right"
  });

  assert.deepEqual(steps, ["activate", "send"]);
  assert.deepEqual(recordedWindows, [{ id: 101, app: "demo.exe" }]);
  assert.deepEqual(recordedInputs, [
    [
      { key: "Control_L", vkCode: 0xa2, flags: 0 },
      { key: "Right", vkCode: 0x27, flags: 0x0001 },
      { key: "Right", vkCode: 0x27, flags: 0x0003 },
      { key: "Control_L", vkCode: 0xa2, flags: 0x0002 }
    ]
  ]);
});
