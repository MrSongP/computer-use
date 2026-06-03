import type { ScrollParams } from "../../../../core/contracts/action.js";
import {
  ensureFiniteNumber,
  ensureNoUnknownKeys,
  ensureObject,
  ensureOptionalNonEmptyString,
  ensureWindowRef
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const scrollCapability: CapabilityDefinition = {
  method: "scroll",
  summary: "Send vertical or horizontal wheel input at a window-relative point.",
  requiresWindowActivation: true
};

export function validateScrollParams(params: ScrollParams): ScrollParams {
  const candidate = ensureObject(params, "scroll params are required");
  ensureNoUnknownKeys(
    candidate,
    ["window", "x", "y", "scroll_x", "scroll_y", "screenshotId"],
    "scroll"
  );
  ensureWindowRef(candidate.window, "scroll");
  ensureFiniteNumber(params.x, "scroll requires finite x and y coordinates");
  ensureFiniteNumber(params.y, "scroll requires finite x and y coordinates");
  ensureOptionalNonEmptyString(
    params.screenshotId,
    "scroll screenshotId must be a non-empty string when provided"
  );

  const scroll_x = normalizeAmount(params.scroll_x);
  const scroll_y = normalizeAmount(params.scroll_y);
  if (scroll_x === 0 && scroll_y === 0) {
    throw new Error("scroll requires a non-zero scroll_x or scroll_y amount");
  }

  return {
    ...params,
    scroll_x,
    scroll_y
  };
}

function normalizeAmount(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }
  if (!Number.isFinite(value)) {
    throw new Error("scroll amounts must be finite numbers");
  }
  return Math.trunc(value);
}
