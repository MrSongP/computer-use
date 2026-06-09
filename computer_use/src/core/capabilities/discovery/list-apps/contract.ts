import type { ListAppsParams } from "../../../../core/contracts/discovery.js";
import {
  ensureNoUnknownKeys,
  ensureObject
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const DEFAULT_LIST_APPS_LIMIT = 60;
export const MAX_LIST_APPS_LIMIT = 500;

export const listAppsCapability: CapabilityDefinition = {
  method: "list_apps",
  summary: "Enumerate launchable apps and attach any currently targetable windows.",
  requiresWindowActivation: false
};

export function validateListAppsParams(params: ListAppsParams): ListAppsParams {
  if (params === undefined || params === null) {
    return { limit: DEFAULT_LIST_APPS_LIMIT };
  }

  const candidate = ensureObject(params, "list_apps params must be an object");
  ensureNoUnknownKeys(
    candidate,
    ["name_contains", "id_contains", "id_includes", "running_only", "has_windows", "limit"],
    "list_apps"
  );

  return {
    name_contains: normalizeOptionalSubstring(candidate.name_contains, "list_apps name_contains"),
    id_contains: normalizeOptionalSubstring(candidate.id_contains, "list_apps id_contains"),
    id_includes: normalizeOptionalSubstring(candidate.id_includes, "list_apps id_includes"),
    running_only: normalizeOptionalBoolean(candidate.running_only, "list_apps running_only"),
    has_windows: normalizeOptionalBoolean(candidate.has_windows, "list_apps has_windows"),
    limit: normalizeLimit(candidate.limit)
  };
}

function normalizeOptionalSubstring(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string when provided`);
  }
  return value.trim();
}

function normalizeOptionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean when provided`);
  }
  return value;
}

function normalizeLimit(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_LIST_APPS_LIMIT;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("list_apps limit must be a finite number when provided");
  }
  return Math.max(1, Math.min(MAX_LIST_APPS_LIMIT, Math.trunc(value)));
}
