import type { JsonRpcRequest, JsonRpcResponse } from "../../../contracts/rpc.js";
import type { WindowStateParams } from "../../../contracts/capture.js";
import type { ExecutionContext } from "../../../runtime/execution-context.js";
import { WindowStateService } from "../../../../windows/capture/window-state-service.js";
import {
  stripTraceOnlyWindowStateFields,
  writeWindowStateTraceArtifacts
} from "../../../trace/window-state-trace.js";
import { getWindowStateCapability, validateWindowStateParams } from "./contract.js";

export class GetWindowStateHandler {
  readonly definition = getWindowStateCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<WindowStateParams>): Promise<JsonRpcResponse<any>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        const params = validateWindowStateParams(request.params);
        trace.setInputParams(params);
        trace.setTargetWindow(params.window);

        this.context.endTurn.begin(request.meta);
        const service = new WindowStateService(this.context.nativeBridge);
        const state = await service.getWindowState(params);
        trace.setTargetWindow(state.window);
        await writeWindowStateTraceArtifacts(trace, state, {
          attachScreenshotTo: "before"
        });

        return {
          id: request.id,
          ok: true,
          result: stripTraceOnlyWindowStateFields(state)
        };
      }
    });
  }
}
