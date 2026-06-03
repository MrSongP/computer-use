import type { ListAppsParams } from "../../../../core/contracts/discovery.js";
import {
  ensureNoUnknownKeys,
  ensureObject
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const listAppsCapability: CapabilityDefinition = {
  method: "list_apps",
  summary: "Enumerate launchable apps and attach any currently targetable windows.",
  requiresWindowActivation: false
};

export function validateListAppsParams(params: ListAppsParams): ListAppsParams {
  if (params === undefined || params === null) {
    return {};
  }

  const candidate = ensureObject(params, "list_apps params must be an object");
  ensureNoUnknownKeys(candidate, [], "list_apps");

  return {};
}
