import type { ActivateWindowParams } from "../../../../core/contracts/action.js";
import {
  ensureNoUnknownKeys,
  ensureObject,
  ensureWindowRef
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const activateWindowCapability: CapabilityDefinition = {
  method: "activate_window",
  summary: "Foregrounds the target window with helper-aligned activation strategy scaffolding.",
  requiresWindowActivation: false
};

export function validateActivateWindowParams(
  params: ActivateWindowParams
): ActivateWindowParams {
  const candidate = ensureObject(params, "activate_window params are required");
  ensureNoUnknownKeys(candidate, ["window"], "activate_window");
  ensureWindowRef(candidate.window, "activate_window");

  return params;
}
