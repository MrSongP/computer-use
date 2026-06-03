import type { WindowRef } from "../../core/contracts/window.js";
import type { NativeBridge } from "../bridge/native-bridge.js";

export interface ActivationStrategy {
  maxForegroundRetries: number;
  unlockSequence: readonly ActivationUnlockStep[];
  desktopFallback: boolean;
  requiresAttachThreadInput: boolean;
  attachThreadInputAvailable: boolean;
  attachThreadInputMode: "native" | "approximate" | "unavailable";
}

export type ActivationUnlockStep = "escape" | "alt";

export interface ActivationPlan {
  targetWindow: WindowRef;
  strategy: ActivationStrategy;
}

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
          : "unavailable"
    }
  };
}
