import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { DragParams, DragResult } from "../../../../core/contracts/action.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { WindowActivationService } from "../../../../windows/activation/window-activator.js";
import { PointerInputService } from "../../../../windows/input/pointer-input-service.js";
import {
  captureTraceWindowStateSnapshot,
  summarizeActionStateDiff,
  summarizeWindowStateDiff
} from "../../../../core/trace/window-state-trace.js";
import { dragCapability, validateDragParams } from "./contract.js";

export class DragHandler {
  readonly definition = dragCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<DragParams>): Promise<JsonRpcResponse<DragResult>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        const params = validateDragParams(request.params);
        trace.setInputParams(params);
        trace.setTargetWindow(params.window);
        trace.setClickCoordinates({
          x: params.from_x,
          y: params.from_y,
          mouseButton: params.button
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
        const execution = await service.drag(params);
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
        await trace.writeJsonArtifact("pointer", "pointer-drag-plan.json", execution.drag);
        await trace.writeJsonArtifact("state-diff", "state-diff.json", summarizeWindowStateDiff(beforeState, afterState));

        return {
          id: request.id,
          ok: true,
          result: {
            ok: true,
            window: params.window,
            requestedStart: { x: params.from_x, y: params.from_y },
            requestedEnd: { x: params.to_x, y: params.to_y },
            screenStart: {
              x: execution.drag.fromX,
              y: execution.drag.fromY
            },
            screenEnd: {
              x: execution.drag.toX,
              y: execution.drag.toY
            },
            drag: {
              button: execution.drag.button,
              durationMs: execution.drag.durationMs,
              steps: execution.drag.steps
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
