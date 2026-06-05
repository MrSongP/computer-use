import type { ActivateWindowResult } from "../../core/contracts/action.js";
import type { WindowRef } from "../../core/contracts/window.js";
import { createActivationPlan, type ActivationPlan } from "./activation-strategy.js";
import type { NativeBridge } from "../bridge/native-bridge.js";

export interface WindowActivationPort {
  activateWindow(window: WindowRef): Promise<ActivateWindowResult | void>;
}

export interface WindowActivationReport extends ActivateWindowResult {
  plan: ActivationPlan;
}

export class WindowActivationService {
  constructor(private readonly port: WindowActivationPort & Partial<Pick<NativeBridge, "capabilities">>) {}

  async activate(window: WindowRef): Promise<ActivationPlan> {
    this.assertValidWindow(window);
    const plan = createActivationPlan(this.port, window);
    await this.port.activateWindow(window);
    return plan;
  }

  async activateWithReport(window: WindowRef): Promise<WindowActivationReport> {
    this.assertValidWindow(window);
    const plan = createActivationPlan(this.port, window);
    const result = await this.port.activateWindow(window);
    return {
      ...normalizeActivationResult(window, result),
      plan
    };
  }

  private assertValidWindow(window: WindowRef): void {
    if (typeof window?.id !== "number" || !Number.isFinite(window.id) || window.id < 0) {
      throw new Error("window activation requires a non-negative window id");
    }
    if (typeof window?.app !== "string" || window.app.trim().length === 0) {
      throw new Error("window activation requires a target app");
    }
  }
}

export const WindowActivator = WindowActivationService;

function normalizeActivationResult(
  window: WindowRef,
  result: ActivateWindowResult | void
): ActivateWindowResult {
  if (result && result.ok === true) {
    return result;
  }

  return {
    ok: true,
    window,
    focused: true,
    focusedSource: "assumed_after_successful_call",
    hint: "The bridge completed activation without a structured focus report."
  };
}
