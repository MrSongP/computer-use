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
    lastReturnedIndex?: number;
  };
}

export interface CaptureRequestMap {
  get_window_state: WindowStateParams;
}

export type CaptureResultMap = {
  get_window_state: WindowStateResult;
};
