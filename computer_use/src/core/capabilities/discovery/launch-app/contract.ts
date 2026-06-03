import type { LaunchAppParams } from "../../../../core/contracts/discovery.js";
import {
  ensureNoUnknownKeys,
  ensureNonEmptyString,
  ensureObject
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const launchAppCapability: CapabilityDefinition = {
  method: "launch_app",
  summary: "Launch an installed app id or executable-path app identifier.",
  requiresWindowActivation: false
};

export function validateLaunchAppParams(params: LaunchAppParams): LaunchAppParams {
  const candidate = ensureObject(params, "launch_app params are required");
  ensureNoUnknownKeys(candidate, ["app"], "launch_app");
  const app = ensureNonEmptyString(candidate.app, "launch_app requires a non-empty app identifier");

  return {
    app
  };
}
