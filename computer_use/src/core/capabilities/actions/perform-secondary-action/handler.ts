import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { PerformSecondaryActionParams } from "../../../../core/contracts/action.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { WindowActivationService } from "../../../../windows/activation/window-activator.js";
import { ElementInteractionService } from "../../../../windows/uia/element-interaction-service.js";
import {
  captureTraceWindowStateSnapshot,
  summarizeWindowStateDiff
} from "../../../../core/trace/window-state-trace.js";
import {
  performSecondaryActionCapability,
  validatePerformSecondaryActionParams
} from "./contract.js";

export class PerformSecondaryActionHandler {
  readonly definition = performSecondaryActionCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<PerformSecondaryActionParams>): Promise<JsonRpcResponse<null>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        const params = validatePerformSecondaryActionParams(request.params);
        trace.setInputParams(params);
        trace.setTargetWindow(params.window);
        trace.setElementInfo({ elementIndex: params.element_index, screenshotId: params.screenshotId });

        this.context.endTurn.begin(request.meta);
        const service = new ElementInteractionService(
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
        const execution = await service.performSecondaryAction(params);
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
        await trace.writeJsonArtifact("uia", "perform-secondary-action.json", execution);
        await trace.writeJsonArtifact("state-diff", "state-diff.json", summarizeWindowStateDiff(beforeState, afterState));

        return { id: request.id, ok: true, result: null };
      }
    });
  }
}
