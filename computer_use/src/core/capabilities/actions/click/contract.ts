import type { ClickParams } from "../../../../core/contracts/action.js";
import {
  ensureFiniteNumber,
  ensureMouseButton,
  ensureNoUnknownKeys,
  ensureObject,
  ensureOptionalNonEmptyString,
  ensurePositiveInteger,
  ensureWindowRef
} from "../../../../core/contracts/validation.js";
import type { CapabilityDefinition } from "../../../../core/runtime/capability-registry.js";

export const clickCapability: CapabilityDefinition = {
  method: "click",
  summary: "Click at window-relative coordinates.",
  requiresWindowActivation: true
};

export function validateClickParams(params: ClickParams): ClickParams {
  const candidate = ensureObject(params, "click params are required");
  ensureNoUnknownKeys(
    candidate,
    ["window", "x", "y", "coordinateSpace", "click_count", "mouse_button", "screenshotId"],
    "click"
  );
  ensureWindowRef(candidate.window, "click");
  if (params.click_count !== undefined) {
    ensurePositiveInteger(params.click_count, "click click_count must be a positive integer");
  }
  ensureMouseButton(
    params.mouse_button,
    "click mouse_button must be one of left, right, middle, l, r, or m"
  );
  ensureOptionalNonEmptyString(
    params.screenshotId,
    "click screenshotId must be a non-empty string when provided"
  );
  ensureFiniteNumber(params.x, "click requires finite x and y coordinates");
  ensureFiniteNumber(params.y, "click requires finite x and y coordinates");
  if (
    params.coordinateSpace !== undefined &&
    params.coordinateSpace !== "window" &&
    params.coordinateSpace !== "screenshot"
  ) {
    throw new Error("click coordinateSpace must be window or screenshot when provided");
  }
  if (params.coordinateSpace === "screenshot") {
    ensureScreenshotCoordinateMetadata(params.window);
  }
  return params;
}

function ensureScreenshotCoordinateMetadata(window: ClickParams["window"]): void {
  const missing: string[] = [];
  if (!isFiniteRect(window.rect)) {
    missing.push("window.rect");
  }
  if (!isFiniteRect(window.visibleClickableRegion)) {
    missing.push("window.visibleClickableRegion");
  }
  if (
    typeof window.screenshotCoordinateScale?.x !== "number" ||
    !Number.isFinite(window.screenshotCoordinateScale.x) ||
    window.screenshotCoordinateScale.x <= 0 ||
    typeof window.screenshotCoordinateScale.y !== "number" ||
    !Number.isFinite(window.screenshotCoordinateScale.y) ||
    window.screenshotCoordinateScale.y <= 0
  ) {
    missing.push("window.screenshotCoordinateScale");
  }

  if (missing.length > 0) {
    const error = new Error(
      "click coordinateSpace=screenshot requires the exact state.window returned by get_window_state, " +
        `including ${missing.join(", ")}. Refresh with get_window_state and retry with that returned window object.`
    ) as Error & {
      code?: string;
      details?: Record<string, unknown>;
      guidance?: Record<string, unknown>;
    };
    error.name = "MissingScreenshotCoordinateMetadataError";
    error.code = "missing_screenshot_coordinate_metadata";
    error.details = {
      missingWindowFields: missing,
      windowId: window.id,
      app: window.app
    };
    error.guidance = {
      should_retry: true,
      model_action: "Call get_window_state for the target window, then retry click with coordinateSpace=screenshot using the returned state.window object.",
      suggested_tool_call: {
        method: "get_window_state",
        params: {
          window: {
            id: window.id,
            app: window.app
          },
          include_screenshot: true,
          include_text: false
        }
      }
    };
    throw error;
  }
}

function isFiniteRect(rect: ClickParams["window"]["rect"]): boolean {
  return Boolean(
    rect &&
      Number.isFinite(rect.left) &&
      Number.isFinite(rect.top) &&
      Number.isFinite(rect.right) &&
      Number.isFinite(rect.bottom) &&
      rect.right > rect.left &&
      rect.bottom > rect.top
  );
}
