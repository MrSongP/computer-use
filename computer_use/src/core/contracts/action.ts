import type { WindowRef } from "./window.js";

export type ActionMethod =
  | "click"
  | "click_element"
  | "press_key"
  | "type_text"
  | "scroll"
  | "set_value"
  | "drag"
  | "perform_secondary_action"
  | "activate_window";

export interface ClickParams {
  window: WindowRef;
  x: number;
  y: number;
  click_count?: number;
  mouse_button?: "left" | "right" | "middle" | "l" | "r" | "m";
  screenshotId?: string;
}

export interface PressKeyParams {
  window: WindowRef;
  key: string;
}

export interface TypeTextParams {
  window: WindowRef;
  text: string;
}

export interface ActivateWindowParams {
  window: WindowRef;
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

export interface ScrollParams {
  window: WindowRef;
  x: number;
  y: number;
  scroll_x?: number;
  scroll_y?: number;
  screenshotId?: string;
}

export interface SetValueParams extends ElementIndexParams {
  value: string;
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

export interface PerformSecondaryActionParams extends ElementIndexParams {
  action: "raise" | "scroll up" | "scroll left" | "scroll down" | "scroll right" | "expand" | "collapse" | string;
}

export interface ActionRequestMap {
  click: ClickParams;
  click_element: ClickElementParams;
  press_key: PressKeyParams;
  type_text: TypeTextParams;
  scroll: ScrollParams;
  set_value: SetValueParams;
  drag: DragParams;
  perform_secondary_action: PerformSecondaryActionParams;
  activate_window: ActivateWindowParams;
}
