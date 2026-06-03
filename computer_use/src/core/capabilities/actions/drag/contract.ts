import type { DragParams } from "../../../../core/contracts/action.js";
import {
  ensureFiniteNumber,
  ensureMouseButton,
  ensureNoUnknownKeys,
  ensureObject,
  ensureOptionalNonEmptyString,
  ensureWindowRef
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const dragCapability: CapabilityDefinition = {
  method: "drag",
  summary: "Send a multi-step pointer drag sequence through the Windows bridge seam.",
  requiresWindowActivation: true
};

export function validateDragParams(params: DragParams): DragParams {
  const candidate = ensureObject(params, "drag params are required");
  ensureNoUnknownKeys(
    candidate,
    ["window", "from_x", "from_y", "to_x", "to_y", "button", "duration_ms", "steps", "screenshotId"],
    "drag"
  );
  ensureWindowRef(candidate.window, "drag");
  for (const key of ["from_x", "from_y", "to_x", "to_y"] as const) {
    ensureFiniteNumber(params[key], `drag requires finite ${key}`);
  }
  ensureMouseButton(
    params.button,
    "drag button must be one of left, right, middle, l, r, or m"
  );
  ensureOptionalNonEmptyString(
    params.screenshotId,
    "drag screenshotId must be a non-empty string when provided"
  );

  return {
    ...params,
    button: params.button ?? "left",
    duration_ms: normalizeDuration(params.duration_ms),
    steps: normalizeSteps(params.steps)
  };
}

function normalizeDuration(durationMs: number | undefined): number {
  if (durationMs === undefined) {
    return 250;
  }
  if (!Number.isFinite(durationMs)) {
    throw new Error("drag duration_ms must be finite");
  }
  return Math.max(0, Math.trunc(durationMs));
}

function normalizeSteps(steps: number | undefined): number {
  if (steps === undefined) {
    return 12;
  }
  if (!Number.isFinite(steps)) {
    throw new Error("drag steps must be finite");
  }
  return Math.max(1, Math.min(120, Math.trunc(steps)));
}
