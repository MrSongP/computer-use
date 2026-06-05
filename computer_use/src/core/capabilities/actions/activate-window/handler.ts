import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { ActivateWindowParams, ActivateWindowResult } from "../../../../core/contracts/action.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { WindowActivationService } from "../../../../windows/activation/window-activator.js";
import { activateWindowCapability, validateActivateWindowParams } from "./contract.js";

export class ActivateWindowHandler {
  readonly definition = activateWindowCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<ActivateWindowParams>): Promise<JsonRpcResponse<ActivateWindowResult>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        const params = validateActivateWindowParams(request.params);
        trace.setInputParams(params);
        trace.setTargetWindow(params.window);

        this.context.endTurn.begin(request.meta);
        const activationService = new WindowActivationService(this.context.nativeBridge);
        const activation = await activationService.activateWithReport(params.window);
        await trace.writeJsonArtifact("activation", "activation-plan.json", activation.plan);

        return {
          id: request.id,
          ok: true,
          result: toActivateWindowResult(activation)
        };
      }
    });
  }
}

function toActivateWindowResult(activation: ActivateWindowResult): ActivateWindowResult {
  const result: ActivateWindowResult = {
    ok: true,
    window: activation.window,
    focused: activation.focused,
    focusedSource: activation.focusedSource
  };
  if (activation.foregroundWindowId !== undefined) {
    result.foregroundWindowId = activation.foregroundWindowId;
  }
  if (activation.hint !== undefined) {
    result.hint = activation.hint;
  }
  return result;
}
