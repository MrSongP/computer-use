import type { ClickElementParams } from "../../../../core/contracts/action.js";
import {
  ensureMouseButton,
  ensureNonNegativeInteger,
  ensureNoUnknownKeys,
  ensureObject,
  ensureOptionalNonEmptyString,
  ensurePositiveInteger,
  ensureWindowRef
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const clickElementCapability: CapabilityDefinition = {
  method: "click_element",
  summary: "Resolve a UIA element by index and invoke its primary pattern action.",
  requiresWindowActivation: true
};

export function validateClickElementParams(params: ClickElementParams): ClickElementParams {
  validateElementParams(
    params,
    "click_element",
    ["window", "element_index", "click_count", "mouse_button", "screenshotId"]
  );
  if (params.click_count !== undefined) {
    ensurePositiveInteger(params.click_count, "click_element click_count must be a positive integer");
  }
  ensureMouseButton(
    params.mouse_button,
    "click_element mouse_button must be one of left, right, middle, l, r, or m"
  );
  ensureOptionalNonEmptyString(
    params.screenshotId,
    "click_element screenshotId must be a non-empty string when provided"
  );
  return {
    ...params,
    click_count: params.click_count ?? 1,
    mouse_button: params.mouse_button ?? "left"
  };
}

export function validateElementParams<T extends { window: unknown; element_index: number }>(
  params: T,
  method: string,
  allowedKeys: readonly string[]
): T {
  const candidate = ensureObject(params, `${method} params are required`);
  ensureNoUnknownKeys(candidate, allowedKeys, method);
  ensureWindowRef(candidate.window, method);
  ensureNonNegativeInteger(params.element_index, `${method} requires a non-negative element_index`);
  return params;
}
