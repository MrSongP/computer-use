import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { GetWindowParams } from "../../../../core/contracts/discovery.js";
import type { WindowRef } from "../../../../core/contracts/window.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { WindowDiscoveryService } from "../../../../windows/discovery/window-discovery-service.js";
import { getWindowCapability, validateGetWindowContractParams } from "./contract.js";

export class GetWindowHandler {
  readonly definition = getWindowCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<GetWindowParams>): Promise<JsonRpcResponse<WindowRef>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        const params = validateGetWindowContractParams(request.params);
        trace.setInputParams(params);

        this.context.endTurn.begin(request.meta);
        const service = new WindowDiscoveryService(this.context.nativeBridge);
        const window = await service.getWindow(params);
        trace.setTargetWindow(window);
        await trace.writeJsonArtifact("window", "window.json", window);

        return {
          id: request.id,
          ok: true,
          result: window
        };
      }
    });
  }
}
