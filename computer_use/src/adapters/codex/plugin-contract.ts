import type { CapabilityMethod } from "../../core/contracts/capability.js";
import type {
  ApprovalRequest,
  JsonRpcErrorResponse,
  JsonRpcMeta
} from "../../core/contracts/rpc.js";

export type CodexAdapterMethod = CapabilityMethod | "end_turn";

export interface CodexCapabilityDescriptor {
  name: CodexAdapterMethod;
  rpcMethod: CodexAdapterMethod;
  summary: string;
  requiresWindowActivation: boolean;
}

export interface CodexInvokeOptions {
  meta?: JsonRpcMeta;
}

export interface CodexPluginContract {
  host: "codex";
  capabilities: readonly CodexCapabilityDescriptor[];
  bootstrap(): Promise<void>;
  invoke(
    method: CodexAdapterMethod,
    params?: unknown,
    options?: CodexInvokeOptions
  ): Promise<unknown>;
  endTurn(meta?: JsonRpcMeta): Promise<void>;
  close(): Promise<void>;
}

export class CodexAdapterRpcError extends Error {
  readonly code: string | undefined;
  readonly approvalRequest: ApprovalRequest | undefined;
  readonly details: JsonRpcErrorResponse["details"];
  readonly guidance: JsonRpcErrorResponse["guidance"];
  readonly response: JsonRpcErrorResponse;

  constructor(response: JsonRpcErrorResponse) {
    super(response.error);
    this.name = "CodexAdapterRpcError";
    this.code = response.code;
    this.approvalRequest = response.approvalRequest;
    this.details = response.details;
    this.guidance = response.guidance;
    this.response = response;
  }
}
