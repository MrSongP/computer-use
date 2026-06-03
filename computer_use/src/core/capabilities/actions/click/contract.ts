import type { ClickParams } from "../../../../core/contracts/action.js";
import {
  ensureFiniteNumber,
  ensureMouseButton,
  ensureNoUnknownKeys,
  ensureNonNegativeInteger,
  ensureObject,
  ensureOptionalNonEmptyString,
  ensurePositiveInteger,
  ensureWindowRef
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const clickCapability: CapabilityDefinition = {
  method: "click",
  summary: "Coordinate-first click action routed through the Windows bridge seam.",
  requiresWindowActivation: true
};

export function validateClickParams(params: ClickParams): ClickParams {
  const candidate = ensureObject(params, "click params are required");
  ensureNoUnknownKeys(
    candidate,
    ["window", "x", "y", "click_count", "mouse_button", "element_index", "screenshotId"],
    "click"
  );
  ensureWindowRef(candidate.window, "click");
  if (params.click_count !== undefined) {
    ensurePositiveInteger(params.click_count, "click click_count must be a positive integer");
  }
  ensureMouseButton(
    params.mouse_button,
    "click mouse_button must be one of left, right, middle, l, r, or m"
  );
  ensureOptionalNonEmptyString(
    params.screenshotId,
    "click screenshotId must be a non-empty string when provided"
  );
  if (params.element_index !== undefined) {
    ensureNonNegativeInteger(
      params.element_index,
      "click element_index must be a non-negative integer when provided"
    );
    return params;
  }
  ensureFiniteNumber(params.x, "click requires finite x and y coordinates");
  ensureFiniteNumber(params.y, "click requires finite x and y coordinates");
  return params;
}
