import type { WindowStateParams, WindowStateResult } from "../../core/contracts/capture.js";
import type { NativeBridge } from "../bridge/native-bridge.js";

export class WindowStateService {
  constructor(private readonly bridge: NativeBridge) {}

  async getWindowState(params: WindowStateParams): Promise<WindowStateResult> {
    return await this.bridge.getWindowState({
      ...params,
      include_screenshot: params.include_screenshot ?? true,
      include_text: params.include_text ?? true
    });
  }
}
