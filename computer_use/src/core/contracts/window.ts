import type { AppIdentifier } from "./app.js";

export interface WindowRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface WindowHealth {
  hung: boolean;
  isResponding: boolean;
  lastInputIdleMs?: number;
}

export interface WindowRef {
  id: number;
  app: AppIdentifier;
  title?: string;
  className?: string;
  rect?: WindowRect;
  visible?: boolean;
  minimized?: boolean;
  focused?: boolean;
  focusedSource?: "GetForegroundWindow" | "assumed_after_successful_call";
  foregroundWindowId?: number;
  rectCoordinateSpace?: "virtual_screen" | "unknown";
  rectOnVirtualScreen?: boolean;
  visibleClickableRegion?: WindowRect;
  screenshotCoordinateScale?: {
    x: number;
    y: number;
  };
  ownerWindowId?: number;
  parentWindowId?: number;
  modalForWindowId?: number;
  health?: WindowHealth;
}
