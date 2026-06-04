import type { WindowStateParams } from "../../../contracts/capture.js";
import {
  ensureNoUnknownKeys,
  ensureObject,
  ensureWindowRef
} from "../../../contracts/validation.js";
import type { CapabilityDefinition } from "../../../runtime/capability-registry.js";

export const getWindowStateCapability: CapabilityDefinition = {
  method: "get_window_state",
  summary: "Capture a window snapshot with optional JPEG screenshot and UIA accessibility tree.",
  requiresWindowActivation: false
};

export function validateWindowStateParams(params: WindowStateParams): WindowStateParams {
  const candidate = ensureObject(params, "get_window_state params are required");
  ensureNoUnknownKeys(
    candidate,
    [
      "window",
      "include_screenshot",
      "include_text",
      "jpeg_quality",
      "max_elements",
      "role_filter",
      "name_contains"
    ],
    "get_window_state"
  );
  ensureWindowRef(candidate.window, "get_window_state");
  if (
    candidate.include_screenshot !== undefined &&
    typeof candidate.include_screenshot !== "boolean"
  ) {
    throw new Error("include_screenshot must be a boolean when provided");
  }
  if (candidate.include_text !== undefined && typeof candidate.include_text !== "boolean") {
    throw new Error("include_text must be a boolean when provided");
  }

  return {
    ...params,
    include_screenshot: params.include_screenshot ?? true,
    include_text: params.include_text ?? true,
    jpeg_quality: normalizeQuality(params.jpeg_quality),
    max_elements: normalizeMaxElements(params.max_elements),
    role_filter: normalizeRoleFilter(params.role_filter),
    name_contains: normalizeNameContains(params.name_contains)
  };
}

function normalizeQuality(quality: number | undefined): number | undefined {
  if (quality === undefined) {
    return undefined;
  }
  if (!Number.isFinite(quality)) {
    throw new Error("jpeg_quality must be a finite number");
  }
  return Math.max(1, Math.min(100, Math.trunc(quality)));
}

function normalizeMaxElements(maxElements: number | undefined): number | undefined {
  if (maxElements === undefined) {
    return undefined;
  }
  if (!Number.isFinite(maxElements)) {
    throw new Error("max_elements must be a finite number");
  }
  return Math.max(1, Math.min(10000, Math.trunc(maxElements)));
}

function normalizeRoleFilter(roleFilter: readonly string[] | undefined): readonly string[] | undefined {
  if (roleFilter === undefined) {
    return undefined;
  }
  if (!Array.isArray(roleFilter)) {
    throw new Error("role_filter must be an array of non-empty strings when provided");
  }

  const normalized = roleFilter.map((role) => {
    if (typeof role !== "string" || role.trim().length === 0) {
      throw new Error("role_filter must contain only non-empty strings");
    }
    return role.trim();
  });

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeNameContains(nameContains: string | undefined): string | undefined {
  if (nameContains === undefined) {
    return undefined;
  }
  if (typeof nameContains !== "string" || nameContains.trim().length === 0) {
    throw new Error("name_contains must be a non-empty string when provided");
  }
  return nameContains.trim();
}
