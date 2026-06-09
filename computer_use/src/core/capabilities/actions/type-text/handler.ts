import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { TypeTextParams, TypeTextResult } from "../../../../core/contracts/action.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { WindowActivationService } from "../../../../windows/activation/window-activator.js";
import { TextInputService } from "../../../../windows/input/text-input-service.js";
import { typeTextCapability, validateTypeTextParams } from "./contract.js";

export class TypeTextHandler {
  readonly definition = typeTextCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<TypeTextParams>): Promise<JsonRpcResponse<TypeTextResult>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        const params = validateTypeTextParams(request.params);
        trace.setInputParams(params);
        trace.setTargetWindow(params.window);

        this.context.endTurn.begin(request.meta);
        const activationService = new WindowActivationService(this.context.nativeBridge);
        const textInputService = new TextInputService(activationService, this.context.nativeBridge);
        const execution = await textInputService.typeText(params);

        return {
          id: request.id,
          ok: true,
          result: {
            ok: true,
            window: params.window,
            activation: execution.activation,
            dispatched: {
              kind: "text",
              inputMethod: execution.inputMethod,
              textLength: execution.textLength,
              utf16CodeUnits: execution.utf16CodeUnits,
              ...(execution.inputEvents !== undefined ? { inputEvents: execution.inputEvents } : {}),
              ...(execution.fallbackFromSendText !== undefined
                ? { fallbackFromSendText: execution.fallbackFromSendText }
                : {})
            }
          }
        };
      }
    });
  }
}
