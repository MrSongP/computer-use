import type {
  JsonRpcRequest,
  JsonRpcResponse
} from "../contracts/rpc.js";

export class JsonRpcCodec {
  parseRequest(line: string): JsonRpcRequest {
    const value: unknown = JSON.parse(line);
    if (typeof value !== "object" || value === null) {
      throw new Error("JSON-RPC request must be an object");
    }

    const request = value as Partial<JsonRpcRequest>;
    if (typeof request.id !== "number" && typeof request.id !== "string") {
      throw new Error("JSON-RPC request id is required");
    }
    if (typeof request.method !== "string" || request.method.length === 0) {
      throw new Error("JSON-RPC request method is required");
    }

    return {
      id: request.id,
      method: request.method,
      params: request.params ?? {},
      meta: request.meta
    };
  }

  stringifyResponse(response: JsonRpcResponse): string {
    return JSON.stringify(response);
  }
}
