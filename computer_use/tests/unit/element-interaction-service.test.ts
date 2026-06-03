import test from "node:test";
import assert from "node:assert/strict";
import type { NativeBridge } from "../../src/windows/bridge/native-bridge.js";
import { ElementInteractionService } from "../../src/windows/uia/element-interaction-service.js";
import type { ClickElementParams, PerformSecondaryActionParams, SetValueParams } from "../../src/core/contracts/action.js";

test("element interaction service activates before invoking UIA actions", async () => {
  const calls: string[] = [];
  const activationPlan = {
    targetWindow: { id: 101, app: "demo.exe" },
    strategy: {
      maxForegroundRetries: 1,
      unlockSequence: [],
      desktopFallback: false,
      requiresAttachThreadInput: true,
      attachThreadInputAvailable: false,
      attachThreadInputMode: "unavailable"
    }
  };
  const activationService = {
    async activate() {
      calls.push("activate");
      return activationPlan;
    }
  };
  const bridge = {
    async clickElement(params: ClickElementParams) {
      calls.push(`click:${params.element_index}`);
    },
    async setValue(params: SetValueParams) {
      calls.push(`set:${params.element_index}:${params.value}`);
    },
    async performSecondaryAction(params: PerformSecondaryActionParams) {
      calls.push(`secondary:${params.element_index}:${params.action}`);
    }
  } as NativeBridge;

  const service = new ElementInteractionService(activationService as any, bridge);
  const clickExecution = await service.clickElement({
    window: { id: 101, app: "demo.exe" },
    element_index: 3
  });
  const setValueExecution = await service.setValue({
    window: { id: 101, app: "demo.exe" },
    element_index: 4,
    value: "hello"
  });
  const secondaryExecution = await service.performSecondaryAction({
    window: { id: 101, app: "demo.exe" },
    element_index: 5,
    action: "  expand  "
  });

  assert.deepEqual(calls, [
    "activate",
    "click:3",
    "activate",
    "set:4:hello",
    "activate",
    "secondary:5:expand"
  ]);
  assert.equal(clickExecution.patternAction, "InvokePattern");
  assert.equal(setValueExecution.patternAction, "ValuePattern");
  assert.equal(secondaryExecution.patternAction, "expand");
});

test("element interaction service rejects invalid UIA payloads", async () => {
  const service = new ElementInteractionService(
    {
      async activate() {
        return {
          targetWindow: { id: 101, app: "demo.exe" },
          strategy: {
            maxForegroundRetries: 1,
            unlockSequence: [],
            desktopFallback: false,
            requiresAttachThreadInput: true,
            attachThreadInputAvailable: false,
            attachThreadInputMode: "unavailable"
          }
        };
      }
    } as any,
    {
      async clickElement() {},
      async setValue() {},
      async performSecondaryAction() {}
    } as unknown as NativeBridge
  );

  await assert.rejects(
    service.clickElement({
      window: { id: 101, app: "demo.exe" },
      element_index: -1
    }),
    /click_element requires a non-negative element_index/
  );
  await assert.rejects(
    service.setValue({
      window: { id: 101, app: "demo.exe" },
      element_index: 1,
      value: null as unknown as string
    }),
    /set_value requires a string value/
  );
  await assert.rejects(
    service.performSecondaryAction({
      window: { id: 101, app: "demo.exe" },
      element_index: 1,
      action: "   "
    }),
    /perform_secondary_action requires an action string/
  );
});
