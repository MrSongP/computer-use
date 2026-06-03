import type { JsonRpcRequest, JsonRpcResponse } from "../contracts/rpc.js";

export type MethodHandler = (
  request: JsonRpcRequest<any>
) => Promise<JsonRpcResponse<any>>;

export const BUILT_IN_METHODS = new Set(["end_turn", "close"]);

export class MethodRegistry {
  private readonly handlers = new Map<string, MethodHandler>();

  register(method: string, handler: MethodHandler): void {
    if (BUILT_IN_METHODS.has(method)) {
      throw new Error(`Cannot override built-in method: ${method}`);
    }

    this.handlers.set(method, handler);
  }

  get(method: string): MethodHandler | undefined {
    return this.handlers.get(method);
  }

  has(method: string): boolean {
    return this.handlers.has(method) || BUILT_IN_METHODS.has(method);
  }

  list(): readonly string[] {
    return Array.from(this.handlers.keys()).sort();
  }
}
