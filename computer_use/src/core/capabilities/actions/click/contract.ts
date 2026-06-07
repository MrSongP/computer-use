import type { ClickParams } from "../../../../core/contracts/action.js";
import {
  ensureFiniteNumber,
  ensureMouseButton,
  ensureNoUnknownKeys,
  ensureObject,
  ensureOptionalNonEmptyString,
  ensurePositiveInteger,
  ensureWindowRef
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const clickCapability: CapabilityDefinition = {
  method: "click",
  summary: "Click at window-relative coordinates.",
  requiresWindowActivation: true
};

export function validateClickParams(params: ClickParams): ClickParams {
  const candidate = ensureObject(params, "click params are required");
  ensureNoUnknownKeys(
    candidate,
    ["window", "x", "y", "coordinateSpace", "click_count", "mouse_button", "screenshotId"],
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
  ensureFiniteNumber(params.x, "click requires finite x and y coordinates");
  ensureFiniteNumber(params.y, "click requires finite x and y coordinates");
  if (
    params.coordinateSpace !== undefined &&
    params.coordinateSpace !== "window" &&
    params.coordinateSpace !== "screenshot"
  ) {
    throw new Error("click coordinateSpace must be window or screenshot when provided");
  }
  return params;
}
