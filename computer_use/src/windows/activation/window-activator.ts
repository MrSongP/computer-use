import type { WindowRef } from "../../core/contracts/window.js";
import { createActivationPlan, type ActivationPlan } from "./activation-strategy.js";
import type { NativeBridge } from "../bridge/native-bridge.js";

export interface WindowActivationPort {
  activateWindow(window: WindowRef): Promise<void>;
}

export class WindowActivationService {
  constructor(private readonly port: WindowActivationPort & Partial<Pick<NativeBridge, "capabilities">>) {}

  async activate(window: WindowRef): Promise<ActivationPlan> {
    if (typeof window?.id !== "number" || !Number.isFinite(window.id) || window.id < 0) {
      throw new Error("window activation requires a non-negative window id");
    }
    if (typeof window?.app !== "string" || window.app.trim().length === 0) {
      throw new Error("window activation requires a target app");
    }

    const plan = createActivationPlan(this.port, window);
    await this.port.activateWindow(window);
    return plan;
  }
}

export const WindowActivator = WindowActivationService;
