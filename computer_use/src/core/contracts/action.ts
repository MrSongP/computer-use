import type { WindowRef } from "./window.js";

export type ActionMethod =
  | "click"
  | "click_element"
  | "select_file_in_dialog"
  | "select_folder_in_dialog"
  | "set_save_path_in_dialog"
  | "press_key"
  | "type_text"
  | "scroll"
  | "set_value"
  | "drag"
  | "perform_secondary_action"
  | "activate_window";

export type ActivationUnlockStep = "escape" | "alt";

export interface ActivationStrategy {
  maxForegroundRetries: number;
  unlockSequence: readonly ActivationUnlockStep[];
  desktopFallback: boolean;
  requiresAttachThreadInput: boolean;
  attachThreadInputAvailable: boolean;
  attachThreadInputMode: "native" | "approximate" | "unavailable";
  attachThreadInputOnOffscreenWindow?: boolean;
}

export interface ActivationPlan {
  targetWindow: WindowRef;
  strategy: ActivationStrategy;
}

export interface ClickParams {
  window: WindowRef;
  x: number;
  y: number;
  coordinateSpace?: "window" | "screenshot";
  click_count?: number;
  mouse_button?: "left" | "right" | "middle" | "l" | "r" | "m";
  screenshotId?: string;
}

export interface PointerScreenPoint {
  x: number;
  y: number;
}

export interface ClickVirtualScreenMetrics {
  originX: number;
  originY: number;
  width: number;
  height: number;
  source: "default" | "native";
}

export interface ClickPlanResult {
  moveFlags: number;
  pixelX: number;
  pixelY: number;
  absoluteX: number;
  absoluteY: number;
  virtualScreen: ClickVirtualScreenMetrics;
}

export interface PostInputFocusResult {
  focused: boolean;
  matchesTarget: boolean;
  foregroundWindowId?: number;
}

export interface PointerHitTestResult {
  rawHwndAtPoint?: number;
  hwndAtPoint?: number;
  window?: WindowRef;
  processName?: string;
  matchesTarget?: boolean;
}

export interface ClickResult {
  ok: true;
  window: WindowRef;
  coordinateSpace: "window" | "screenshot";
  requestedPoint: PointerScreenPoint;
  windowPoint: PointerScreenPoint;
  screenPoint: PointerScreenPoint;
  clickPlan: ClickPlanResult;
  activation: ActivateWindowResult & {
    plan: ActivationPlan;
  };
  postInputFocus?: PostInputFocusResult;
  hitTest?: PointerHitTestResult;
  warnings?: readonly string[];
}

export interface ActionStateDiffResult {
  collected: boolean;
  changed?: boolean;
  changedFields?: readonly string[];
  reason?: "trace_disabled" | "snapshot_unavailable";
}

export interface PressKeyParams {
  window: WindowRef;
  key: string;
}

export interface PressKeyResult {
  ok: true;
  window: WindowRef;
  key: string;
  activation: ActivationPlan;
  dispatched: {
    kind: "keyboard_chord";
    normalizedKeys: readonly string[];
    inputEvents: number;
  };
}

export interface TypeTextParams {
  window: WindowRef;
  text: string;
}

export interface TypeTextResult {
  ok: true;
  window: WindowRef;
  activation: ActivationPlan;
  dispatched: {
    kind: "text";
    inputMethod: "sendText" | "unicodeKeyboardInputs";
    textLength: number;
    utf16CodeUnits: number;
    inputEvents?: number;
    fallbackFromSendText?: boolean;
  };
}

export interface ActivateWindowParams {
  window: WindowRef;
}

export interface ActivateWindowResult {
  ok: true;
  window: WindowRef;
  focused: boolean;
  focusedSource: "GetForegroundWindow" | "assumed_after_successful_call";
  foregroundWindowId?: number;
  hint?: string;
}

export interface ElementIndexParams {
  window: WindowRef;
  element_index: number;
  screenshotId?: string;
}

export interface ClickElementParams extends ElementIndexParams {
  click_count?: number;
  mouse_button?: "left" | "right" | "middle" | "l" | "r" | "m";
}

export interface ClickElementResult {
  ok: true;
  window: WindowRef;
  elementIndex: number;
  dispatched: "InvokePattern" | string;
  activation: ActivationPlan;
  screenshotId?: string;
}

export interface ScrollParams {
  window: WindowRef;
  x: number;
  y: number;
  scroll_x?: number;
  scroll_y?: number;
  screenshotId?: string;
}

export interface ScrollResult {
  ok: true;
  window: WindowRef;
  requestedPoint: PointerScreenPoint;
  screenPoint: PointerScreenPoint;
  scroll: {
    scrollX: number;
    scrollY: number;
  };
  activation: ActivationPlan;
  stateDiff?: ActionStateDiffResult;
  screenshotId?: string;
}

export interface SetValueParams extends ElementIndexParams {
  value: string;
}

export interface SetValueResult {
  ok: true;
  window: WindowRef;
  elementIndex: number;
  dispatched: "ValuePattern" | string;
  activation: ActivationPlan;
  valueLength: number;
  utf16CodeUnits: number;
  stateDiff?: ActionStateDiffResult;
  screenshotId?: string;
}

export interface DragParams {
  window: WindowRef;
  from_x: number;
  from_y: number;
  to_x: number;
  to_y: number;
  button?: "left" | "right" | "middle" | "l" | "r" | "m";
  duration_ms?: number;
  steps?: number;
  screenshotId?: string;
}

export interface DragResult {
  ok: true;
  window: WindowRef;
  requestedStart: PointerScreenPoint;
  requestedEnd: PointerScreenPoint;
  screenStart: PointerScreenPoint;
  screenEnd: PointerScreenPoint;
  drag: {
    button: "left" | "right" | "middle";
    durationMs: number;
    steps: number;
  };
  activation: ActivationPlan;
  stateDiff?: ActionStateDiffResult;
  screenshotId?: string;
}

export interface PerformSecondaryActionParams extends ElementIndexParams {
  action: "raise" | "scroll up" | "scroll left" | "scroll down" | "scroll right" | "expand" | "collapse" | string;
}

export interface PerformSecondaryActionResult {
  ok: true;
  window: WindowRef;
  elementIndex: number;
  requestedAction: string;
  dispatched: string;
  activation: ActivationPlan;
  stateDiff?: ActionStateDiffResult;
  screenshotId?: string;
}

export interface CommonDialogPathParams {
  window: WindowRef;
  path: string;
}

export interface CommonDialogPathResult {
  ok: true;
  path: string;
  dialogClosed: boolean | null;
  helper: "select_file_in_dialog" | "select_folder_in_dialog" | "set_save_path_in_dialog";
}

export interface ActionRequestMap {
  click: ClickParams;
  click_element: ClickElementParams;
  select_file_in_dialog: CommonDialogPathParams;
  select_folder_in_dialog: CommonDialogPathParams;
  set_save_path_in_dialog: CommonDialogPathParams;
  press_key: PressKeyParams;
  type_text: TypeTextParams;
  scroll: ScrollParams;
  set_value: SetValueParams;
  drag: DragParams;
  perform_secondary_action: PerformSecondaryActionParams;
  activate_window: ActivateWindowParams;
}

export interface ActionResultMap {
  click: ClickResult;
  click_element: ClickElementResult;
  select_file_in_dialog: CommonDialogPathResult;
  select_folder_in_dialog: CommonDialogPathResult;
  set_save_path_in_dialog: CommonDialogPathResult;
  press_key: PressKeyResult;
  type_text: TypeTextResult;
  scroll: ScrollResult;
  set_value: SetValueResult;
  drag: DragResult;
  perform_secondary_action: PerformSecondaryActionResult;
  activate_window: ActivateWindowResult;
}
