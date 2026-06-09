import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { ListAppsParams, ListAppsResult } from "../../../../core/contracts/discovery.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { WindowDiscoveryService } from "../../../../windows/discovery/window-discovery-service.js";
import { listAppsCapability, validateListAppsParams } from "./contract.js";

export class ListAppsHandler {
  readonly definition = listAppsCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<ListAppsParams>): Promise<JsonRpcResponse<ListAppsResult>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        const params = validateListAppsParams(request.params);
        trace.setInputParams(params);

        this.context.endTurn.begin(request.meta);
        const service = new WindowDiscoveryService(this.context.nativeBridge);
        const apps = await service.listApps(params);
        await trace.writeJsonArtifact("apps", "apps.json", apps);

        return {
          id: request.id,
          ok: true,
          result: apps
        };
      }
    });
  }
}
