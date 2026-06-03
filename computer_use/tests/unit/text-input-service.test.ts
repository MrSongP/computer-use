import test from "node:test";
import assert from "node:assert/strict";
import type { WindowRef } from "../../src/core/contracts/window.js";
import { WindowActivationService } from "../../src/windows/activation/window-activator.js";
import { TextInputService } from "../../src/windows/input/text-input-service.js";
import type { KeyboardInput } from "../../src/windows/shared/win32-types.js";

test("TextInputService activates the window and emits unicode keydown/keyup pairs", async () => {
  const steps: string[] = [];
  const recordedWindows: WindowRef[] = [];
  const recordedInputs: Array<readonly KeyboardInput[]> = [];
  const activationService = new WindowActivationService({
    async activateWindow(window) {
      steps.push("activate");
      recordedWindows.push(window);
    }
  });
  const service = new TextInputService(activationService, {
    async sendKeyboardInputs(inputs) {
      steps.push("send");
      recordedInputs.push([...inputs]);
    }
  });

  await service.typeText({
    window: { id: 101, app: "demo.exe" },
    text: "A"
  });

  assert.deepEqual(steps, ["activate", "send"]);
  assert.deepEqual(recordedWindows, [{ id: 101, app: "demo.exe" }]);
  assert.deepEqual(recordedInputs, [
    [
      { key: "A", vkCode: 0, scanCode: 0x41, flags: 0x0004 },
      { key: "A", vkCode: 0, scanCode: 0x41, flags: 0x0006 }
    ]
  ]);
});

test("TextInputService expands supplementary-plane characters into surrogate input pairs", async () => {
  let recordedInputs: readonly KeyboardInput[] = [];
  const activationService = new WindowActivationService({
    async activateWindow() {}
  });
  const service = new TextInputService(activationService, {
    async sendKeyboardInputs(inputs) {
      recordedInputs = [...inputs];
    }
  });

  await service.typeText({
    window: { id: 101, app: "demo.exe" },
    text: "🎉"
  });

  assert.deepEqual(recordedInputs, [
    { key: "🎉", vkCode: 0, scanCode: 0xd83c, flags: 0x0004 },
    { key: "🎉", vkCode: 0, scanCode: 0xd83c, flags: 0x0006 },
    { key: "🎉", vkCode: 0, scanCode: 0xdf89, flags: 0x0004 },
    { key: "🎉", vkCode: 0, scanCode: 0xdf89, flags: 0x0006 }
  ]);
});
