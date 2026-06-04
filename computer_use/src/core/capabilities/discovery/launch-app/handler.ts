import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { LaunchAppParams } from "../../../../core/contracts/discovery.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { AppLaunchService } from "../../../../windows/launch/app-launch-service.js";
import { launchAppCapability, validateLaunchAppParams } from "./contract.js";

export class LaunchAppHandler {
  readonly definition = launchAppCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<LaunchAppParams>): Promise<JsonRpcResponse<null>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        const params = validateLaunchAppParams(request.params);
        trace.setInputParams(params);

        this.context.endTurn.begin(request.meta);
        const service = new AppLaunchService(this.context.nativeBridge);
        const plan = await service.launch(params);
        await trace.writeJsonArtifact("launch", "launch-plan.json", plan);

        return {
          id: request.id,
          ok: true,
          result: null
        };
      }
    });
  }
}
