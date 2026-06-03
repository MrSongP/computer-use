import type { SetValueParams } from "../../../../core/contracts/action.js";
import { ensureOptionalNonEmptyString } from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";
import { validateElementParams } from "../click-element/contract.js";

export const setValueCapability: CapabilityDefinition = {
  method: "set_value",
  summary: "Resolve a UIA element by index and set its ValuePattern value.",
  requiresWindowActivation: true
};

export function validateSetValueParams(params: SetValueParams): SetValueParams {
  validateElementParams(params, "set_value", ["window", "element_index", "value", "screenshotId"]);
  ensureOptionalNonEmptyString(
    params.screenshotId,
    "set_value screenshotId must be a non-empty string when provided"
  );
  if (typeof params.value !== "string") {
    throw new Error("set_value requires a string value");
  }
  return params;
}
