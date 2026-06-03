import type { JsonRpcRequest, JsonRpcResponse } from "../../../../core/contracts/rpc.js";
import type { PressKeyParams } from "../../../../core/contracts/action.js";
import type { ExecutionContext } from "../../../../core/runtime/execution-context.js";
import { WindowActivationService } from "../../../../windows/activation/window-activator.js";
import { KeyboardInputService } from "../../../../windows/input/keyboard-input-service.js";
import { pressKeyCapability, validatePressKeyParams } from "./contract.js";

export class PressKeyHandler {
  readonly definition = pressKeyCapability;

  constructor(private readonly context: ExecutionContext) {}

  async handle(request: JsonRpcRequest<PressKeyParams>): Promise<JsonRpcResponse<null>> {
    return this.context.trace.runAction({
      actionType: this.definition.method,
      request,
      execute: async (trace) => {
        const interruptError = this.context.endTurn.check(request.meta);
        if (interruptError) {
          return { id: request.id, ok: false, code: "interrupted", error: interruptError };
        }

        const params = validatePressKeyParams(request.params);
        trace.setInputParams(params);
        trace.setTargetWindow(params.window);

        this.context.endTurn.begin(request.meta);
        const activationService = new WindowActivationService(this.context.nativeBridge);
        const keyboardInputService = new KeyboardInputService(
          activationService,
          this.context.nativeBridge
        );
        await keyboardInputService.pressKey(params);

        return {
          id: request.id,
          ok: true,
          result: null
        };
      }
    });
  }
}
