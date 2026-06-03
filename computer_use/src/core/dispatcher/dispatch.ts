import type { JsonRpcRequest, JsonRpcResponse } from "../contracts/rpc.js";
import { MethodRegistry } from "./method-registry.js";

export class Dispatcher {
  constructor(private readonly methods: MethodRegistry) {}

  async dispatch(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const handler = this.methods.get(request.method);
    if (!handler) {
      return {
        id: request.id,
        ok: false,
        code: "unknown_method",
        error: `Unknown method: ${request.method}`
      };
    }
    return handler(request);
  }
}
