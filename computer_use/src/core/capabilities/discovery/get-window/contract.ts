import type { GetWindowParams } from "../../../../core/contracts/discovery.js";
import {
  ensureNoUnknownKeys,
  ensureNonNegativeInteger,
  ensureObject,
  ensureOptionalNonEmptyString
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const getWindowCapability: CapabilityDefinition = {
  method: "get_window",
  summary: "Rehydrate a targetable window object from a previously returned window id.",
  requiresWindowActivation: false
};

export function validateGetWindowContractParams(params: GetWindowParams): GetWindowParams {
  const candidate = ensureObject(params, "get_window params are required");
  ensureNoUnknownKeys(candidate, ["id", "app", "window"], "get_window");
  const nestedWindow = candidate.window !== undefined
    ? ensureObject(candidate.window, "get_window window must be a valid window object")
    : undefined;
  const idSource = nestedWindow?.id ?? candidate.id;
  const appSource = nestedWindow?.app ?? candidate.app;
  const id = ensureNonNegativeInteger(idSource, "get_window requires a non-negative integer id");
  const app = ensureOptionalNonEmptyString(
    appSource,
    "get_window app must be a non-empty string when provided"
  );

  return {
    id,
    ...(app ? { app } : {})
  };
}
