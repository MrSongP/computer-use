import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { ActivateWindowParams } from "../../../../core/contracts/action.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { WindowActivationService } from "../../../../windows/activation/window-activator.js";
import { activateWindowCapability, validateActivateWindowParams } from "./contract.js";

export class ActivateWindowHandler {
  readonly definition = activateWindowCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<ActivateWindowParams>): Promise<JsonRpcResponse<null>> {
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
        const plan = await activationService.activate(params.window);
        await trace.writeJsonArtifact("activation", "activation-plan.json", plan);

        return {
          id: request.id,
          ok: true,
          result: null
        };
      }
    });
  }
}
