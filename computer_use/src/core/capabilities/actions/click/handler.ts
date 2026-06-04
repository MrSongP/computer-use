import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { ClickParams } from "../../../../core/contracts/action.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { WindowActivationService } from "../../../../windows/activation/window-activator.js";
import { PointerInputService } from "../../../../windows/input/pointer-input-service.js";
import { clickCapability, validateClickParams } from "./contract.js";

export class ClickHandler {
  readonly definition = clickCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<ClickParams>): Promise<JsonRpcResponse<null>> {
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

        return {
          id: request.id,
          ok: true,
          result: null
        };
      }
    });
  }
}
