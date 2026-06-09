import type { WindowRect, WindowRef } from "./window.js";

export type CaptureMethod = "get_window_state";

export type Rect = WindowRect;

export interface WindowStateParams {
  window: WindowRef;
  include_screenshot?: boolean;
  include_text?: boolean;
  jpeg_quality?: number;
  max_elements?: number;
  role_filter?: readonly string[];
  name_contains?: string;
}

export interface WindowStateScreenshot {
  data: string;
  mime: "image/jpeg";
  width: number;
  height: number;
  byteLength: number;
  source: "wgc" | "gdi_fallback" | "mock";
  coordinateSpace?: "screenshot";
  coordinateMapping?: {
    origin: {
      windowX: number;
      windowY: number;
      screenX: number;
      screenY: number;
    };
    scale: {
      x: number;
      y: number;
    };
    windowRect?: Rect;
    visibleClickableRegion?: Rect;
  };
  degradedReason?: "wgc_failed" | string;
  gdiFallbackAt?: string;
  raw?: {
    data: string;
    mime: "image/png";
    byteLength: number;
  };
}

export interface AccessibilityNode {
  index: number;
  role: string;
  name?: string;
  value?: string;
  bounds?: Rect;
  description?: string;
  enabled?: boolean;
  offscreen?: boolean;
  patterns?: readonly string[];
  secondaryActions?: readonly string[];
  children: readonly AccessibilityNode[];
}

export interface WindowStateWindowInfo extends WindowRef {
  rect: Rect;
  visible: boolean;
  minimized: boolean;
  focused: boolean;
  focusedSource?: "GetForegroundWindow" | "assumed_after_successful_call";
  foregroundWindowId?: number;
  rectCoordinateSpace?: "virtual_screen" | "unknown";
  rectOnVirtualScreen?: boolean;
  ownerWindowId?: number;
  parentWindowId?: number;
  modalForWindowId?: number;
}

export interface WindowStateResult {
  window: WindowStateWindowInfo;
  screenshot?: WindowStateScreenshot;
  text?: AccessibilityNode;
  capture: {
    screenshotRequested: boolean;
    textRequested: boolean;
    screenshotSource?: string;
    textSource?: string;
    elementsReturned?: number;
    elementsTotal?: number;
    elementsMatched?: number;
    truncated?: boolean;
    partial?: boolean;
    degradedReasons?: readonly string[];
    recommendedFallbacks?: readonly CaptureRecommendedFallback[];
    screenshotDegradedReason?: string;
    lastReturnedIndex?: number;
  };
  trace?: {
    screenshotPath?: string;
    rawScreenshotPath?: string;
    responsePath?: string;
  };
}

export interface CaptureRecommendedFallback {
  reason: string;
  action:
    | "use_coordinates"
    | "retry_with_smaller_filters"
    | "wait_and_retry"
    | "activate_first"
    | "stop_input";
  note: string;
}

export interface CaptureRequestMap {
  get_window_state: WindowStateParams;
}

export type CaptureResultMap = {
  get_window_state: WindowStateResult;
};
