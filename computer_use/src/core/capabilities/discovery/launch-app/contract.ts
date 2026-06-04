import type { LaunchAppMode, LaunchAppParams } from "../../../../core/contracts/discovery.js";
import {
  ensureNoUnknownKeys,
  ensureNonEmptyString,
  ensureObject
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const launchAppCapability: CapabilityDefinition = {
  method: "launch_app",
  summary: "Launch an app, or reject duplicate cold-launches with taskbar/tray recovery guidance.",
  requiresWindowActivation: false
};

export function validateLaunchAppParams(params: LaunchAppParams): LaunchAppParams {
  const candidate = ensureObject(params, "launch_app params are required");
  ensureNoUnknownKeys(candidate, ["app", "launch_mode"], "launch_app");
  const app = ensureNonEmptyString(candidate.app, "launch_app requires a non-empty app identifier");
  const launchMode = validateLaunchAppMode(candidate.launch_mode);

  return {
    app,
    ...(launchMode ? { launch_mode: launchMode } : {})
  };
}

function validateLaunchAppMode(value: unknown): LaunchAppMode | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "reuse_or_launch" || value === "force_new") {
    return value;
  }

  throw new Error("launch_app launch_mode must be reuse_or_launch or force_new when provided");
}
