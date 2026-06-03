import type { PerformSecondaryActionParams } from "../../../../core/contracts/action.js";
import { ensureOptionalNonEmptyString } from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";
import { validateElementParams } from "../click-element/contract.js";

export const performSecondaryActionCapability: CapabilityDefinition = {
  method: "perform_secondary_action",
  summary: "Resolve a UIA element by index and execute a secondary pattern action.",
  requiresWindowActivation: true
};

export function validatePerformSecondaryActionParams(
  params: PerformSecondaryActionParams
): PerformSecondaryActionParams {
  validateElementParams(
    params,
    "perform_secondary_action",
    ["window", "element_index", "action", "screenshotId"]
  );
  ensureOptionalNonEmptyString(
    params.screenshotId,
    "perform_secondary_action screenshotId must be a non-empty string when provided"
  );
  if (typeof params.action !== "string" || params.action.trim().length === 0) {
    throw new Error("perform_secondary_action requires an action string");
  }
  return {
    ...params,
    action: params.action.trim()
  };
}
