import type { ClickParams } from "../../core/contracts/action.js";

export const POINTER_ABSOLUTE_MAX = 0xffff;
const POINTER_MOVE_FLAGS = 0xc001;

export interface VirtualScreenMetrics {
  originX: number;
  originY: number;
  width: number;
  height: number;
  source: "default" | "native";
}

export interface NormalizedPointerCoordinate {
  pixelX: number;
  pixelY: number;
  absoluteX: number;
  absoluteY: number;
}

export interface PointerScrollPrimitive {
  kind: "scroll";
  wheelFlags: {
    vertical: number;
    horizontal: number;
  };
}

export interface PointerDragPrimitive {
  kind: "drag";
  moveFlags: number;
  suggestedStepPixels: number;
}

export interface PointerClickPlan {
  moveFlags: number;
  coordinates: NormalizedPointerCoordinate;
  reservedPrimitives: {
    scroll: PointerScrollPrimitive;
    drag: PointerDragPrimitive;
  };
}

export function resolveVirtualScreenMetrics(
  override?: Partial<VirtualScreenMetrics>
): VirtualScreenMetrics {
  const width = Math.trunc(override?.width ?? 1920);
  const height = Math.trunc(override?.height ?? 1080);
  if (width < 2 || height < 2) {
    throw new Error("virtual screen size is invalid");
  }

  return {
    originX: Math.trunc(override?.originX ?? 0),
    originY: Math.trunc(override?.originY ?? 0),
    width,
    height,
    source: override?.source ?? "default"
  };
}

export function normalizePointerCoordinate(
  x: number,
  y: number,
  virtualScreen: VirtualScreenMetrics = resolveVirtualScreenMetrics()
): NormalizedPointerCoordinate {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Pointer click requires finite coordinates");
  }

  return {
    pixelX: x,
    pixelY: y,
    absoluteX: Math.round(((x - virtualScreen.originX) * POINTER_ABSOLUTE_MAX) / (virtualScreen.width - 1)),
    absoluteY: Math.round(((y - virtualScreen.originY) * POINTER_ABSOLUTE_MAX) / (virtualScreen.height - 1))
  };
}

export function buildPointerClickPlan(
  params: ClickParams,
  virtualScreen: VirtualScreenMetrics = resolveVirtualScreenMetrics()
): PointerClickPlan {
  return {
    moveFlags: POINTER_MOVE_FLAGS,
    coordinates: normalizePointerCoordinate(params.x!, params.y!, virtualScreen),
    reservedPrimitives: {
      scroll: {
        kind: "scroll",
        wheelFlags: {
          vertical: 0x0800,
          horizontal: 0x1000
        }
      },
      drag: {
        kind: "drag",
        moveFlags: POINTER_MOVE_FLAGS,
        suggestedStepPixels: 5
      }
    }
  };
}
