import { LifecycleManager } from "./lifecycle-manager.js";
import { InterruptState } from "../interrupt/interrupt-state.js";
import { EndTurnCoordinator } from "../interrupt/end-turn.js";
import type { NativeBridge } from "../../windows/bridge/native-bridge.js";
import { TraceManager } from "../trace/tracer.js";
import type { TraceOptions } from "../trace/trace-config.js";

export interface ExecutionContext {
  nativeBridge: NativeBridge;
  lifecycle: LifecycleManager;
  interrupts: InterruptState;
  endTurn: EndTurnCoordinator;
  trace: TraceManager;
}

export function createDefaultRuntime(args: {
  nativeBridge: NativeBridge;
  trace?: TraceOptions;
}): ExecutionContext {
  const lifecycle = new LifecycleManager(args.nativeBridge);
  const interrupts = new InterruptState();

  return {
    nativeBridge: args.nativeBridge,
    lifecycle,
    interrupts,
    endTurn: new EndTurnCoordinator(lifecycle, interrupts),
    trace: new TraceManager(
      lifecycle,
      interrupts,
      args.nativeBridge.driverName,
      args.nativeBridge.capabilities as Record<string, unknown> | undefined,
      args.trace
    )
  };
}
