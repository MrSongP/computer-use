import type {
  ClickParams,
  DragParams,
  PointerHitTestResult,
  PostInputFocusResult,
  ScrollParams
} from "../../core/contracts/action.js";
import type { WindowRef } from "../../core/contracts/window.js";
import type { WindowActivationReport, WindowActivationService } from "../activation/window-activator.js";
import type { PointerClick, PointerDrag, PointerScroll } from "../shared/win32-types.js";
import {
  buildPointerClickPlan,
  isPointWithinVirtualScreen,
  resolveVirtualScreenMetrics,
  type PointerClickPlan,
  type VirtualScreenMetrics
} from "./pointer-primitives.js";
import type { ActivationPlan } from "../activation/activation-strategy.js";

type CanonicalMouseButton = "left" | "right" | "middle";

export interface PointerInputPort {
  sendPointerClick(click: PointerClick, options?: PointerClickOptions): Promise<PointerClickFeedback | void>;
  sendPointerScroll?(scroll: PointerScroll): Promise<void>;
  sendPointerDrag?(drag: PointerDrag): Promise<void>;
  getVirtualScreenMetrics?(): Promise<VirtualScreenMetrics>;
}

export interface PointerClickOptions {
  targetWindow?: WindowRef;
}

export interface PointerClickFeedback {
  postInputFocus?: PostInputFocusResult;
  hitTest?: PointerHitTestResult;
}

export interface PointerClickExecution {
  activation: WindowActivationReport;
  clickPlan: PointerClickPlan;
  pointerClick: PointerClick;
  coordinateSpace: "window" | "screenshot";
  requestedPoint: { x: number; y: number };
  windowPoint: { x: number; y: number };
  feedback?: PointerClickFeedback;
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
    assertScreenshotCoordinateMetadata(normalizedParams);
    const activation = await this.activationService.activateWithReport(normalizedParams.window);
    const pointerClick = toPointerClick(normalizedParams);
    const virtualScreen = await this.resolveVirtualScreen();
    assertPointInsideVirtualScreen(pointerClick.x, pointerClick.y, virtualScreen, normalizedParams);
    const clickPlan = buildPointerClickPlan(
      pointerClick.x,
      pointerClick.y,
      virtualScreen
    );
    const feedback = normalizeClickFeedback(
      await this.port.sendPointerClick(pointerClick, {
        targetWindow: normalizedParams.window
      }),
      normalizedParams.window
    );
    return {
      activation,
      clickPlan,
      pointerClick,
      coordinateSpace: normalizedParams.coordinateSpace ?? "window",
      requestedPoint: {
        x: normalizedParams.x,
        y: normalizedParams.y
      },
      windowPoint: resolveWindowPoint(normalizedParams),
      feedback
    };
  }

  async scroll(params: ScrollParams): Promise<PointerScrollExecution> {
    const scroll = toPointerScroll(params);
    const activation = await this.activationService.activate(params.window);
    const virtualScreen = await this.resolveVirtualScreen();
    assertPointInsideVirtualScreen(scroll.x, scroll.y, virtualScreen, params);
    if (!this.port.sendPointerScroll) {
      throw new Error("Native bridge does not support pointer scroll");
    }
    await this.port.sendPointerScroll(scroll);
    return { activation, scroll };
  }

  async drag(params: DragParams): Promise<PointerDragExecution> {
    const drag = toPointerDrag(params);
    const activation = await this.activationService.activate(params.window);
    const virtualScreen = await this.resolveVirtualScreen();
    assertPointInsideVirtualScreen(drag.fromX, drag.fromY, virtualScreen, params);
    assertPointInsideVirtualScreen(drag.toX, drag.toY, virtualScreen, params);
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

    try {
      return await this.port.getVirtualScreenMetrics();
    } catch (error) {
      throw new VirtualScreenMetricsUnavailableError(error);
    }
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
  assertScreenshotCoordinateMetadata(params);
  const { x, y } = resolveWindowPoint(params);
  if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
    throw new Error("Pointer click requires finite coordinates");
  }

  assertWindowRelativePoint(params.window, x, y, "Pointer click");
  const point = resolveScreenPoint(params.window, x, y);

  return {
    x: point.x,
    y: point.y,
    button: normalizeMouseButton(params.mouse_button),
    clickCount: normalizeClickCount(params.click_count)
  };
}

function assertScreenshotCoordinateMetadata(params: ClickParams): void {
  if (params.coordinateSpace !== "screenshot") {
    return;
  }

  const missing: string[] = [];
  if (!isFiniteRect(params.window.rect)) {
    missing.push("window.rect");
  }
  if (!isFiniteRect(params.window.visibleClickableRegion)) {
    missing.push("window.visibleClickableRegion");
  }
  if (
    typeof params.window.screenshotCoordinateScale?.x !== "number" ||
    !Number.isFinite(params.window.screenshotCoordinateScale.x) ||
    params.window.screenshotCoordinateScale.x <= 0 ||
    typeof params.window.screenshotCoordinateScale.y !== "number" ||
    !Number.isFinite(params.window.screenshotCoordinateScale.y) ||
    params.window.screenshotCoordinateScale.y <= 0
  ) {
    missing.push("window.screenshotCoordinateScale");
  }

  if (missing.length > 0) {
    throw new MissingScreenshotCoordinateMetadataError(params, missing);
  }
}

function isFiniteRect(rect: WindowRef["rect"]): boolean {
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

export function toPointerScroll(params: ScrollParams): PointerScroll {
  assertFiniteCoordinate(params.x, params.y, "Pointer scroll");
  assertWindowRelativePoint(params.window, params.x, params.y, "Pointer scroll");
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
  assertWindowRelativePoint(params.window, params.from_x, params.from_y, "Pointer drag start");
  assertWindowRelativePoint(params.window, params.to_x, params.to_y, "Pointer drag end");

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

function assertWindowRelativePoint(
  window: WindowRef,
  x: number,
  y: number,
  label: string
): void {
  const rect = window.rect;
  if (!rect) {
    return;
  }

  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  if (
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.right) ||
    !Number.isFinite(rect.bottom) ||
    width <= 0 ||
    height <= 0
  ) {
    return;
  }

  if (x < 0 || x >= width || y < 0 || y >= height) {
    throw new CoordinatesOutsideWindowError(label, x, y, width, height, window);
  }
}

function assertPointInsideVirtualScreen(
  x: number,
  y: number,
  virtualScreen: VirtualScreenMetrics,
  params?: ClickParams | ScrollParams | DragParams
): void {
  if (!isPointWithinVirtualScreen(x, y, virtualScreen)) {
    throw new CoordinatesOutsideVirtualScreenError(x, y, virtualScreen, params);
  }
}

function normalizeClickFeedback(
  feedback: PointerClickFeedback | void,
  targetWindow: WindowRef
): PointerClickFeedback | undefined {
  if (!feedback) {
    return undefined;
  }

  const result: PointerClickFeedback = { ...feedback };
  if (result.hitTest) {
    result.hitTest = {
      ...result.hitTest,
      matchesTarget: result.hitTest.matchesTarget ?? matchesWindow(result.hitTest.hwndAtPoint, targetWindow)
    };
  }
  if (result.postInputFocus) {
    result.postInputFocus = {
      ...result.postInputFocus,
      matchesTarget: result.postInputFocus.matchesTarget ??
        matchesWindow(result.postInputFocus.foregroundWindowId, targetWindow)
    };
  }

  return result;
}

function matchesWindow(candidateId: number | undefined, targetWindow: WindowRef): boolean {
  return typeof candidateId === "number" && candidateId === targetWindow.id;
}

export class CoordinatesOutsideWindowError extends Error {
  readonly code = "coordinates_outside_window";
  readonly details: Record<string, unknown>;

  constructor(
    label: string,
    x: number,
    y: number,
    width: number,
    height: number,
    window: WindowRef
  ) {
    super(
      `${label} coordinates (${x}, ${y}) are outside the target window bounds ` +
        `[0, ${width}) x [0, ${height}).`
    );
    this.name = "CoordinatesOutsideWindowError";
    this.details = {
      x,
      y,
      windowWidth: width,
      windowHeight: height,
      window
    };
  }
}

export class CoordinatesOutsideVirtualScreenError extends Error {
  readonly code = "coordinates_outside_virtual_screen";
  readonly details: Record<string, unknown>;

  constructor(x: number, y: number, virtualScreen: VirtualScreenMetrics, params?: ClickParams | ScrollParams | DragParams) {
    const right = virtualScreen.originX + virtualScreen.width;
    const bottom = virtualScreen.originY + virtualScreen.height;
    super(
      `Pointer screen coordinates (${x}, ${y}) are outside the virtual screen bounds ` +
        `[${virtualScreen.originX}, ${right}) x [${virtualScreen.originY}, ${bottom}).`
    );
    this.name = "CoordinatesOutsideVirtualScreenError";
    this.details = {
      failureClass: "offscreen_window_region",
      x,
      y,
      computedScreenCoordinate: { x, y },
      virtualScreenBounds: {
        left: virtualScreen.originX,
        top: virtualScreen.originY,
        right,
        bottom
      },
      virtualScreen,
      recommendedSafeScreenCoordinate: {
        x: Math.max(virtualScreen.originX, Math.min(x, right - 1)),
        y: Math.max(virtualScreen.originY, Math.min(y, bottom - 1))
      },
      targetWindowRect: params?.window.rect,
      requestedWindowRelativeCoordinate: readRequestedCoordinate(params),
      recoveryHints: [
        {
          action: "refreshWindow"
        },
        {
          action: "moveWindowIntoViewport"
        }
      ]
    };
  }
}

export class VirtualScreenMetricsUnavailableError extends Error {
  readonly code = "virtual_screen_metrics_unavailable";
  readonly details: Record<string, unknown>;

  constructor(cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`Could not resolve Windows virtual screen metrics before pointer input: ${message}`);
    this.name = "VirtualScreenMetricsUnavailableError";
    this.details = {
      cause: message
    };
  }
}

export class MissingScreenshotCoordinateMetadataError extends Error {
  readonly code = "missing_screenshot_coordinate_metadata";
  readonly details: Record<string, unknown>;
  readonly guidance: Record<string, unknown>;

  constructor(params: ClickParams, missingWindowFields: readonly string[]) {
    super(
      "click coordinateSpace=screenshot requires the exact state.window returned by get_window_state, " +
        `including ${missingWindowFields.join(", ")}.`
    );
    this.name = "MissingScreenshotCoordinateMetadataError";
    this.details = {
      missingWindowFields,
      windowId: params.window.id,
      app: params.window.app
    };
    this.guidance = {
      should_retry: true,
      model_action: "Call get_window_state for the target window, then retry click with coordinateSpace=screenshot using the returned state.window object.",
      suggested_tool_call: {
        method: "get_window_state",
        params: {
          window: {
            id: params.window.id,
            app: params.window.app
          },
          include_screenshot: true,
          include_text: false
        }
      }
    };
  }
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

function resolveWindowPoint(params: ClickParams): { x: number; y: number } {
  if (params.coordinateSpace !== "screenshot") {
    return { x: params.x, y: params.y };
  }

  const visibleRegion = params.window.visibleClickableRegion;
  if (!visibleRegion) {
    return { x: params.x, y: params.y };
  }

  return {
    x: visibleRegion.left + params.x * (params.window.screenshotCoordinateScale?.x ?? 1),
    y: visibleRegion.top + params.y * (params.window.screenshotCoordinateScale?.y ?? 1)
  };
}

function readRequestedCoordinate(params?: ClickParams | ScrollParams | DragParams): Record<string, number | undefined> | undefined {
  if (!params) {
    return undefined;
  }
  if ("from_x" in params) {
    return {
      fromX: params.from_x,
      fromY: params.from_y,
      toX: params.to_x,
      toY: params.to_y
    };
  }
  return {
    x: params.x,
    y: params.y
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
