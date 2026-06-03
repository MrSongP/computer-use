import type { TypeTextParams } from "../../../../core/contracts/action.js";
import {
  ensureNoUnknownKeys,
  ensureObject,
  ensureWindowRef
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const typeTextCapability: CapabilityDefinition = {
  method: "type_text",
  summary: "Literal text entry routed through the Windows bridge seam.",
  requiresWindowActivation: true
};

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export function validateTypeTextParams(params: TypeTextParams): TypeTextParams {
  const candidate = ensureObject(params, "type_text params are required");
  ensureNoUnknownKeys(candidate, ["window", "text"], "type_text");
  ensureWindowRef(candidate.window, "type_text");
  if (typeof candidate.text !== "string") {
    throw new Error("type_text requires a text string");
  }
  if (CONTROL_CHARACTER_PATTERN.test(candidate.text)) {
    throw new Error("type_text only accepts literal text; use press_key for control input");
  }
  return params;
}
