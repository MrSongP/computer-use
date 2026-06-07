import type { WindowStateParams, WindowStateResult } from "../../core/contracts/capture.js";
import type { NativeBridge } from "../bridge/native-bridge.js";
import type { VirtualScreenMetrics } from "../input/pointer-primitives.js";

export class WindowStateService {
  constructor(private readonly bridge: NativeBridge) {}

  async getWindowState(params: WindowStateParams): Promise<WindowStateResult> {
    const state = await this.bridge.getWindowState({
      ...params,
      include_screenshot: params.include_screenshot ?? true,
      include_text: params.include_text ?? true
    });
    return enrichWindowStateCoordinateMetadata(state, await this.tryGetVirtualScreenMetrics());
  }

  private async tryGetVirtualScreenMetrics(): Promise<VirtualScreenMetrics | null> {
    try {
      return await this.bridge.getVirtualScreenMetrics();
    } catch {
      return null;
    }
  }
}

export function enrichWindowStateCoordinateMetadata(
  state: WindowStateResult,
  virtualScreen: VirtualScreenMetrics | null
): WindowStateResult {
  const rect = state.window.rect;
  if (!state.screenshot || !rect) {
    return state;
  }

  const visibleScreenRect = virtualScreen
    ? intersectRects(rect, {
        left: virtualScreen.originX,
        top: virtualScreen.originY,
        right: virtualScreen.originX + virtualScreen.width,
        bottom: virtualScreen.originY + virtualScreen.height
      })
    : rect;
  const visibleClickableRegion = visibleScreenRect
    ? {
        left: visibleScreenRect.left - rect.left,
        top: visibleScreenRect.top - rect.top,
        right: visibleScreenRect.right - rect.left,
        bottom: visibleScreenRect.bottom - rect.top
      }
    : undefined;
  const regionWidth = Math.max(1, (visibleClickableRegion?.right ?? rect.right - rect.left) - (visibleClickableRegion?.left ?? 0));
  const regionHeight = Math.max(1, (visibleClickableRegion?.bottom ?? rect.bottom - rect.top) - (visibleClickableRegion?.top ?? 0));
  const screenshotCoordinateScale = {
    x: regionWidth / Math.max(1, state.screenshot.width),
    y: regionHeight / Math.max(1, state.screenshot.height)
  };

  return {
    ...state,
    window: {
      ...state.window,
      visibleClickableRegion,
      screenshotCoordinateScale
    },
    screenshot: {
      ...state.screenshot,
      coordinateSpace: "screenshot",
      coordinateMapping: {
        origin: {
          windowX: visibleClickableRegion?.left ?? 0,
          windowY: visibleClickableRegion?.top ?? 0,
          screenX: visibleScreenRect?.left ?? rect.left,
          screenY: visibleScreenRect?.top ?? rect.top
        },
        scale: screenshotCoordinateScale,
        windowRect: rect,
        visibleClickableRegion
      }
    }
  };
}

function intersectRects(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): { left: number; top: number; right: number; bottom: number } | undefined {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return right > left && bottom > top ? { left, top, right, bottom } : undefined;
}
