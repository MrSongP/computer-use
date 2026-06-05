import type { JsonRpcMeta } from "../../core/contracts/rpc.js";
import type { AppDescriptor, AppIdentifier } from "../../core/contracts/app.js";
import type { WindowStateParams, WindowStateResult } from "../../core/contracts/capture.js";
import type { GetWindowParams, LaunchAppMode } from "../../core/contracts/discovery.js";
import type {
  ActivateWindowResult,
  ClickElementParams,
  PerformSecondaryActionParams,
  SetValueParams
} from "../../core/contracts/action.js";
import type { WindowRef } from "../../core/contracts/window.js";
import type { VirtualScreenMetrics } from "../input/pointer-primitives.js";
import type { PointerClickFeedback, PointerClickOptions } from "../input/pointer-input-service.js";
import type { KeyboardInput, PointerClick, PointerDrag, PointerScroll } from "../shared/win32-types.js";

export interface NativeBridgeCapabilities {
  activationModel?: {
    supportsAttachThreadInput: boolean;
    approximatesThreadInputAttachment?: boolean;
    supportsDesktopSwitching: boolean;
    supportsSyntheticEscapeUnlock: boolean;
    supportsSyntheticAltUnlock: boolean;
    foregroundRetryCount?: number;
    unlockSequence?: readonly ("escape" | "alt")[];
  };
  pointerModel?: {
    usesVirtualScreenCoordinates: boolean;
    providesVirtualScreenMetrics: boolean;
    dpiAwareness: "unknown" | "system" | "per-monitor-v2";
  };
  lifecycleModel?: {
    supportsPhysicalEscapeHook: boolean;
    supportsInterruptMarkers: boolean;
    transport: "embedded" | "powershell";
  };
}

export interface NativeAppLaunchOptions {
  launchMode?: LaunchAppMode;
}

export interface NativeBridge {
  readonly driverName: string;
  readonly capabilities?: NativeBridgeCapabilities;
  beginTurn(meta?: JsonRpcMeta): void;
  endTurn(): void;
  getVirtualScreenMetrics(): Promise<VirtualScreenMetrics>;
  activateWindow(window: WindowRef): Promise<ActivateWindowResult>;
  sendText(text: string): Promise<void>;
  sendKeyboardInputs(inputs: readonly KeyboardInput[]): Promise<void>;
  sendPointerClick(click: PointerClick, options?: PointerClickOptions): Promise<PointerClickFeedback | void>;
  sendPointerScroll(scroll: PointerScroll): Promise<void>;
  sendPointerDrag(drag: PointerDrag): Promise<void>;
  listWindows(): Promise<readonly WindowRef[]>;
  getWindow(params: GetWindowParams): Promise<WindowRef>;
  listApps(): Promise<readonly AppDescriptor[]>;
  launchApp(app: AppIdentifier, options?: NativeAppLaunchOptions): Promise<void>;
  getWindowState(params: WindowStateParams): Promise<WindowStateResult>;
  clickElement(params: ClickElementParams): Promise<void>;
  setValue(params: SetValueParams): Promise<void>;
  performSecondaryAction(params: PerformSecondaryActionParams): Promise<void>;
}
