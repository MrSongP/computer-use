import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { ListWindowsParams } from "../../../../core/contracts/discovery.js";
import type { WindowRef } from "../../../../core/contracts/window.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { WindowDiscoveryService } from "../../../../windows/discovery/window-discovery-service.js";
import { listWindowsCapability, validateListWindowsParams } from "./contract.js";

export class ListWindowsHandler {
  readonly definition = listWindowsCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<ListWindowsParams>): Promise<JsonRpcResponse<readonly WindowRef[]>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        validateListWindowsParams(request.params);
        trace.setInputParams({});

        this.context.endTurn.begin(request.meta);
        const service = new WindowDiscoveryService(this.context.nativeBridge);
        const windows = await service.listWindows();
        await trace.writeJsonArtifact("windows", "windows.json", windows);

        return {
          id: request.id,
          ok: true,
          result: windows
        };
      }
    });
  }
}
