import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { ClickParams, ClickResult } from "../../../../core/contracts/action.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { WindowActivationService } from "../../../../windows/activation/window-activator.js";
import type { PointerClickExecution } from "../../../../windows/input/pointer-input-service.js";
import { PointerInputService } from "../../../../windows/input/pointer-input-service.js";
import { clickCapability, validateClickParams } from "./contract.js";

export class ClickHandler {
  readonly definition = clickCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<ClickParams>): Promise<JsonRpcResponse<ClickResult>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        const params = validateClickParams(request.params);
        trace.setInputParams(params);
        trace.setTargetWindow(params.window);
        trace.setElementInfo(
          params.screenshotId === undefined
            ? null
            : {
                screenshotId: params.screenshotId
              }
        );

        this.context.endTurn.begin(request.meta);
        const activationService = new WindowActivationService(this.context.nativeBridge);
        trace.setClickCoordinates({
          x: params.x,
          y: params.y,
          mouseButton: params.mouse_button,
          clickCount: params.click_count
        });
        const pointerInputService = new PointerInputService(
          activationService,
          this.context.nativeBridge
        );
        const execution = await pointerInputService.click(params);
        await trace.writeJsonArtifact("activation", "activation-plan.json", execution.activation);
        await trace.writeJsonArtifact("pointer", "pointer-click-plan.json", execution.clickPlan);
        if (execution.feedback) {
          await trace.writeJsonArtifact("pointer-feedback", "pointer-click-feedback.json", execution.feedback);
        }

        return {
          id: request.id,
          ok: true,
          result: toClickResult(execution)
        };
      }
    });
  }
}

function toClickResult(execution: PointerClickExecution): ClickResult {
  const warnings: string[] = [];
  const postInputFocus = execution.feedback?.postInputFocus;
  const hitTest = execution.feedback?.hitTest;
  if (postInputFocus && !postInputFocus.matchesTarget) {
    warnings.push("focus_lost_after_click");
  }
  if (hitTest && hitTest.matchesTarget === false) {
    warnings.push("click_likely_missed_target");
  }

    return {
    ok: true,
    window: execution.activation.window,
    coordinateSpace: execution.coordinateSpace,
    requestedPoint: execution.requestedPoint,
    windowPoint: execution.windowPoint,
    screenPoint: {
      x: execution.pointerClick.x,
      y: execution.pointerClick.y
    },
    clickPlan: {
      moveFlags: execution.clickPlan.moveFlags,
      pixelX: execution.clickPlan.coordinates.pixelX,
      pixelY: execution.clickPlan.coordinates.pixelY,
      absoluteX: execution.clickPlan.coordinates.absoluteX,
      absoluteY: execution.clickPlan.coordinates.absoluteY,
      virtualScreen: execution.clickPlan.virtualScreen
    },
    activation: execution.activation,
    postInputFocus,
    hitTest,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}
