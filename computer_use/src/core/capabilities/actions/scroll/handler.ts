import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { ScrollParams, ScrollResult } from "../../../../core/contracts/action.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { WindowActivationService } from "../../../../windows/activation/window-activator.js";
import { PointerInputService } from "../../../../windows/input/pointer-input-service.js";
import {
  captureTraceWindowStateSnapshot,
  summarizeActionStateDiff,
  summarizeWindowStateDiff
} from "../../../../core/trace/window-state-trace.js";
import { scrollCapability, validateScrollParams } from "./contract.js";

export class ScrollHandler {
  readonly definition = scrollCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<ScrollParams>): Promise<JsonRpcResponse<ScrollResult>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        const params = validateScrollParams(request.params);
        trace.setInputParams(params);
        trace.setTargetWindow(params.window);
        trace.setClickCoordinates({
          x: params.x,
          y: params.y
        });

        this.context.endTurn.begin(request.meta);
        const service = new PointerInputService(
          new WindowActivationService(this.context.nativeBridge),
          this.context.nativeBridge
        );
        const beforeState = await captureTraceWindowStateSnapshot({
          trace,
          label: "before",
          attachScreenshotTo: "before",
          getState: () => this.context.nativeBridge.getWindowState({
            window: params.window,
            include_screenshot: true,
            include_text: true
          })
        });
        const execution = await service.scroll(params);
        const afterState = await captureTraceWindowStateSnapshot({
          trace,
          label: "after",
          attachScreenshotTo: "after",
          getState: () => this.context.nativeBridge.getWindowState({
            window: params.window,
            include_screenshot: true,
            include_text: true
          })
        });
        await trace.writeJsonArtifact("activation", "activation-plan.json", execution.activation);
        await trace.writeJsonArtifact("pointer", "pointer-scroll-plan.json", execution.scroll);
        await trace.writeJsonArtifact("state-diff", "state-diff.json", summarizeWindowStateDiff(beforeState, afterState));

        return {
          id: request.id,
          ok: true,
          result: {
            ok: true,
            window: params.window,
            requestedPoint: { x: params.x, y: params.y },
            screenPoint: {
              x: execution.scroll.x,
              y: execution.scroll.y
            },
            scroll: {
              scrollX: execution.scroll.scrollX,
              scrollY: execution.scroll.scrollY
            },
            activation: execution.activation,
            stateDiff: summarizeActionStateDiff(beforeState, afterState, trace.isEnabled()),
            ...(params.screenshotId ? { screenshotId: params.screenshotId } : {})
          }
        };
      }
    });
  }
}
