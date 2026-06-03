import type { ListWindowsParams } from "../../../../core/contracts/discovery.js";
import {
  ensureNoUnknownKeys,
  ensureObject
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const listWindowsCapability: CapabilityDefinition = {
  method: "list_windows",
  summary: "Enumerate visible top-level windows that can be targeted by follow-up actions.",
  requiresWindowActivation: false
};

export function validateListWindowsParams(params: ListWindowsParams): ListWindowsParams {
  if (params === undefined || params === null) {
    return {};
  }

  const candidate = ensureObject(params, "list_windows params must be an object");
  ensureNoUnknownKeys(candidate, [], "list_windows");

  return {};
}
