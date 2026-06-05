import type { WindowRef } from "../../core/contracts/window.js";
import type { NativeBridge } from "../bridge/native-bridge.js";
import type { ActivationPlan } from "../../core/contracts/action.js";

export type {
  ActivationPlan,
  ActivationStrategy,
  ActivationUnlockStep
} from "../../core/contracts/action.js";

export function createActivationPlan(
  bridge: Pick<NativeBridge, "capabilities">,
  window: WindowRef
): ActivationPlan {
  const activationModel = bridge.capabilities?.activationModel;

  return {
    targetWindow: window,
    strategy: {
      maxForegroundRetries: activationModel?.foregroundRetryCount ?? 20,
      unlockSequence: activationModel?.unlockSequence ?? ["escape", "alt"],
      desktopFallback: activationModel?.supportsDesktopSwitching ?? false,
      requiresAttachThreadInput: true,
      attachThreadInputAvailable: activationModel?.supportsAttachThreadInput ?? false,
      attachThreadInputMode: activationModel?.supportsAttachThreadInput
        ? "native"
        : activationModel?.approximatesThreadInputAttachment
          ? "approximate"
          : "unavailable",
      attachThreadInputOnOffscreenWindow: isOffscreenWindow(window)
    }
  };
}

function isOffscreenWindow(window: WindowRef): boolean {
  const rect = window.rect;
  return Boolean(
    rect &&
      (Number.isFinite(rect.left) && rect.left < 0 ||
        Number.isFinite(rect.top) && rect.top < 0)
  );
}
