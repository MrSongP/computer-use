import type { ClickParams, DragParams, ScrollParams } from "../../core/contracts/action.js";
import type { WindowRef } from "../../core/contracts/window.js";
import type { WindowActivationService } from "../activation/window-activator.js";
import type { PointerClick, PointerDrag, PointerScroll } from "../shared/win32-types.js";
import {
  buildPointerClickPlan,
  resolveVirtualScreenMetrics,
  type PointerClickPlan,
  type VirtualScreenMetrics
} from "./pointer-primitives.js";
import type { ActivationPlan } from "../activation/activation-strategy.js";

type CanonicalMouseButton = "left" | "right" | "middle";

export interface PointerInputPort {
  sendPointerClick(click: PointerClick): Promise<void>;
  sendPointerScroll?(scroll: PointerScroll): Promise<void>;
  sendPointerDrag?(drag: PointerDrag): Promise<void>;
  getVirtualScreenMetrics?(): Promise<VirtualScreenMetrics>;
}

export interface PointerClickExecution {
  activation: ActivationPlan;
  clickPlan: PointerClickPlan;
}

export interface PointerScrollExecution {
  activation: ActivationPlan;
  scroll: PointerScroll;
}

export interface PointerDragExecution {
  activation: ActivationPlan;
  drag: PointerDrag;
}

export class PointerInputService {
  constructor(
    private readonly activationService: WindowActivationService,
    private readonly port: PointerInputPort,
    private readonly virtualScreen: VirtualScreenMetrics = resolveVirtualScreenMetrics()
  ) {}

  async click(params: ClickParams): Promise<PointerClickExecution> {
    const normalizedParams = normalizeClickParams(params);
    const activation = await this.activationService.activate(normalizedParams.window);
    const clickPlan = buildPointerClickPlan(
      normalizedParams,
      await this.resolveVirtualScreen()
    );
    await this.port.sendPointerClick(toPointerClick(normalizedParams));
    return {
      activation,
      clickPlan
    };
  }

  async scroll(params: ScrollParams): Promise<PointerScrollExecution> {
    const scroll = toPointerScroll(params);
    const activation = await this.activationService.activate(params.window);
    if (!this.port.sendPointerScroll) {
      throw new Error("Native bridge does not support pointer scroll");
    }
    await this.port.sendPointerScroll(scroll);
    return { activation, scroll };
  }

  async drag(params: DragParams): Promise<PointerDragExecution> {
    const drag = toPointerDrag(params);
    const activation = await this.activationService.activate(params.window);
    if (!this.port.sendPointerDrag) {
      throw new Error("Native bridge does not support pointer drag");
    }
    await this.port.sendPointerDrag(drag);
    return { activation, drag };
  }

  private async resolveVirtualScreen(): Promise<VirtualScreenMetrics> {
    if (!this.port.getVirtualScreenMetrics) {
      return this.virtualScreen;
    }

    return await this.port.getVirtualScreenMetrics();
  }
}

export function normalizeClickParams(params: ClickParams): ClickParams {
  return {
    ...params,
    click_count: normalizeClickCount(params.click_count),
    mouse_button: normalizeMouseButton(params.mouse_button)
  };
}

export function toPointerClick(params: ClickParams): PointerClick {
  const { x, y } = params;
  if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
    throw new Error("Pointer click requires finite coordinates");
  }

  const point = resolveScreenPoint(params.window, x, y);

  return {
    x: point.x,
    y: point.y,
    button: normalizeMouseButton(params.mouse_button),
    clickCount: normalizeClickCount(params.click_count)
  };
}

export function toPointerScroll(params: ScrollParams): PointerScroll {
  assertFiniteCoordinate(params.x, params.y, "Pointer scroll");
  const scrollX = normalizeWheelAmount(params.scroll_x);
  const scrollY = normalizeWheelAmount(params.scroll_y);
  if (scrollX === 0 && scrollY === 0) {
    throw new Error("scroll requires a non-zero scroll_x or scroll_y amount");
  }

  const point = resolveScreenPoint(params.window, params.x, params.y);

  return {
    x: point.x,
    y: point.y,
    scrollX,
    scrollY
  };
}

export function toPointerDrag(params: DragParams): PointerDrag {
  assertFiniteCoordinate(params.from_x, params.from_y, "Pointer drag start");
  assertFiniteCoordinate(params.to_x, params.to_y, "Pointer drag end");

  const start = resolveScreenPoint(params.window, params.from_x, params.from_y);
  const end = resolveScreenPoint(params.window, params.to_x, params.to_y);

  return {
    fromX: start.x,
    fromY: start.y,
    toX: end.x,
    toY: end.y,
    button: normalizeMouseButton(params.button),
    durationMs: normalizeDuration(params.duration_ms),
    steps: normalizeSteps(params.steps)
  };
}

function resolveScreenPoint(window: WindowRef, x: number, y: number): { x: number; y: number } {
  const rect = window.rect;
  if (
    rect &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top)
  ) {
    return {
      x: Math.round(rect.left + x),
      y: Math.round(rect.top + y)
    };
  }

  return {
    x: Math.round(x),
    y: Math.round(y)
  };
}

function assertFiniteCoordinate(x: number | undefined, y: number | undefined, label: string): void {
  if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
    throw new Error(`${label} requires finite coordinates`);
  }
}

function normalizeWheelAmount(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }

  if (!Number.isFinite(value)) {
    throw new Error("scroll amounts must be finite numbers");
  }

  return Math.trunc(value);
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

function normalizeClickCount(clickCount: number | undefined): number {
  if (clickCount === undefined) {
    return 1;
  }

  return Math.max(1, Math.trunc(clickCount));
}

function normalizeMouseButton(button: ClickParams["mouse_button"]): CanonicalMouseButton {
  switch (button) {
    case undefined:
    case "left":
    case "l":
      return "left";
    case "right":
    case "r":
      return "right";
    case "middle":
    case "m":
      return "middle";
    default:
      throw new Error(`Unsupported mouse button: ${button}`);
  }
}
