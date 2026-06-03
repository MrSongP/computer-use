import type { PressKeyParams } from "../../../../core/contracts/action.js";
import {
  ensureNoUnknownKeys,
  ensureNonEmptyString,
  ensureObject,
  ensureWindowRef
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const pressKeyCapability: CapabilityDefinition = {
  method: "press_key",
  summary: "Keyboard chord action routed through the Windows bridge seam.",
  requiresWindowActivation: true
};

export function validatePressKeyParams(params: PressKeyParams): PressKeyParams {
  const candidate = ensureObject(params, "press_key params are required");
  ensureNoUnknownKeys(candidate, ["window", "key"], "press_key");
  ensureWindowRef(candidate.window, "press_key");
  const key = ensureNonEmptyString(candidate.key, "press_key requires a key string");
  return {
    ...params,
    key
  };
}
