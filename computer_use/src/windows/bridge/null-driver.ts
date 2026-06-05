import type { JsonRpcMeta } from "../../core/contracts/rpc.js";
import type { AppDescriptor, AppIdentifier } from "../../core/contracts/app.js";
import type { WindowStateParams, WindowStateResult } from "../../core/contracts/capture.js";
import type { GetWindowParams } from "../../core/contracts/discovery.js";
import type {
  ActivateWindowResult,
  ClickElementParams,
  PerformSecondaryActionParams,
  SetValueParams
} from "../../core/contracts/action.js";
import type { WindowRef } from "../../core/contracts/window.js";
import { createTaskbarApp, createTaskbarWindow, isTaskbarAppId } from "../../core/hooks/shell/taskbar-target.js";
import { resolveVirtualScreenMetrics, type VirtualScreenMetrics } from "../input/pointer-primitives.js";
import type { KeyboardInput, PointerClick, PointerDrag, PointerScroll } from "../shared/win32-types.js";
import type { NativeAppLaunchOptions, NativeBridge } from "./native-bridge.js";

export interface RecordedInvocation {
  name: string;
  payload: unknown;
}

export class NullNativeBridge implements NativeBridge {
  readonly driverName: string = "null";
  readonly capabilities = {
    activationModel: {
      supportsAttachThreadInput: false,
      approximatesThreadInputAttachment: false,
      supportsDesktopSwitching: false,
      supportsSyntheticEscapeUnlock: false,
      supportsSyntheticAltUnlock: false,
      foregroundRetryCount: 1,
      unlockSequence: [] as const
    },
    pointerModel: {
      usesVirtualScreenCoordinates: false,
      providesVirtualScreenMetrics: false,
      dpiAwareness: "unknown" as const
    },
    lifecycleModel: {
      supportsPhysicalEscapeHook: false,
      supportsInterruptMarkers: false,
      transport: "embedded" as const
    }
  };
  protected readonly invocations: RecordedInvocation[] = [];

  beginTurn(meta?: JsonRpcMeta): void {
    this.invocations.push({ name: "beginTurn", payload: meta ?? null });
  }

  endTurn(): void {
    this.invocations.push({ name: "endTurn", payload: null });
  }

  async activateWindow(window: WindowRef): Promise<ActivateWindowResult> {
    this.invocations.push({ name: "activateWindow", payload: window });
    return {
      ok: true,
      window,
      focused: true,
      focusedSource: "assumed_after_successful_call"
    };
  }

  async getVirtualScreenMetrics(): Promise<VirtualScreenMetrics> {
    const metrics = resolveVirtualScreenMetrics();
    this.invocations.push({ name: "getVirtualScreenMetrics", payload: metrics });
    return metrics;
  }

  async sendText(text: string): Promise<void> {
    this.invocations.push({ name: "sendText", payload: text });
  }

  async sendKeyboardInputs(inputs: readonly KeyboardInput[]): Promise<void> {
    this.invocations.push({ name: "sendKeyboardInputs", payload: inputs });
  }

  async sendPointerClick(click: PointerClick): Promise<void> {
    this.invocations.push({ name: "sendPointerClick", payload: click });
  }

  async sendPointerScroll(scroll: PointerScroll): Promise<void> {
    this.invocations.push({ name: "sendPointerScroll", payload: scroll });
  }

  async sendPointerDrag(drag: PointerDrag): Promise<void> {
    this.invocations.push({ name: "sendPointerDrag", payload: drag });
  }

  async listWindows(): Promise<readonly WindowRef[]> {
    const windows = [{ id: 101, app: "demo.exe", title: "Demo Window" }] as const;
    this.invocations.push({ name: "listWindows", payload: windows });
    return windows;
  }

  async getWindow(params: GetWindowParams): Promise<WindowRef> {
    if (isTaskbarAppId(params.app)) {
      const taskbarWindow = createTaskbarWindow(params.id);
      this.invocations.push({ name: "getWindow", payload: params });
      return taskbarWindow;
    }

    const window = {
      id: params.id,
      app: params.app ?? "demo.exe",
      title: "Demo Window"
    };
    this.invocations.push({ name: "getWindow", payload: params });
    return window;
  }

  async listApps(): Promise<readonly AppDescriptor[]> {
    const apps: readonly AppDescriptor[] = [
      {
        id: "demo.exe",
        displayName: "Demo App",
        executablePath: "C:\\Demo\\demo.exe",
        isRunning: true,
        activationModel: "executable_path",
        windows: [{ id: 101, app: "demo.exe", title: "Demo Window" }]
      },
      createTaskbarApp(501)
    ];
    this.invocations.push({ name: "listApps", payload: apps });
    return apps;
  }

  async launchApp(app: AppIdentifier, options?: NativeAppLaunchOptions): Promise<void> {
    this.invocations.push({ name: "launchApp", payload: { app, options: options ?? null } });
  }

  async getWindowState(params: WindowStateParams): Promise<WindowStateResult> {
    const result: WindowStateResult = {
      window: {
        ...params.window,
        title: params.window.title ?? "Demo Window",
        rect: { left: 10, top: 20, right: 650, bottom: 500 },
        visible: true,
        minimized: false,
        focused: true,
        focusedSource: "assumed_after_successful_call",
        foregroundWindowId: 101,
        rectCoordinateSpace: "virtual_screen",
        rectOnVirtualScreen: true
      },
      screenshot: params.include_screenshot === false
        ? undefined
        : {
            data: Buffer.from("mock-jpeg").toString("base64"),
            mime: "image/jpeg",
            width: 640,
            height: 480,
            byteLength: 9,
            source: "mock",
            raw: {
              data: Buffer.from("mock-png").toString("base64"),
              mime: "image/png",
              byteLength: 8
            }
          },
      text: params.include_text === false
        ? undefined
        : {
            index: 0,
            role: "Window",
            name: params.window.title ?? "Demo Window",
            bounds: { left: 10, top: 20, right: 650, bottom: 500 },
            enabled: true,
            offscreen: false,
            patterns: ["InvokePattern", "ValuePattern", "ExpandCollapsePattern"],
            secondaryActions: ["raise", "expand", "collapse"],
            children: [
              {
                index: 1,
                role: "Button",
                name: "OK",
                bounds: { left: 20, top: 40, right: 80, bottom: 70 },
                enabled: true,
                offscreen: false,
                patterns: ["InvokePattern"],
                secondaryActions: ["raise"],
                children: []
              }
            ]
          },
      capture: {
        screenshotRequested: params.include_screenshot !== false,
        textRequested: params.include_text !== false,
        screenshotSource: params.include_screenshot === false ? undefined : "mock",
        textSource: params.include_text === false ? undefined : "mock",
        elementsReturned: params.include_text === false ? undefined : 2,
        elementsTotal: params.include_text === false ? undefined : 2,
        elementsMatched: params.include_text === false ? undefined : 2,
        truncated: params.include_text === false ? undefined : false,
        partial: params.include_text === false ? undefined : false,
        lastReturnedIndex: params.include_text === false ? undefined : 1
      }
    };
    this.invocations.push({ name: "getWindowState", payload: params });
    return result;
  }

  async clickElement(params: ClickElementParams): Promise<void> {
    this.invocations.push({ name: "clickElement", payload: params });
  }

  async setValue(params: SetValueParams): Promise<void> {
    this.invocations.push({ name: "setValue", payload: params });
  }

  async performSecondaryAction(params: PerformSecondaryActionParams): Promise<void> {
    this.invocations.push({ name: "performSecondaryAction", payload: params });
  }

  getRecordedInvocations(): readonly RecordedInvocation[] {
    return this.invocations;
  }
}
