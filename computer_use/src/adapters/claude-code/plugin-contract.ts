import type { CapabilityMethod } from "../../core/contracts/capability.js";
import type {
  ApprovalRequest,
  JsonRpcErrorResponse,
  JsonRpcMeta,
  TurnMetadata
} from "../../core/contracts/rpc.js";
import type { ToolInputSchema } from "./tool-schema.js";

export type ClaudeCodeAdapterMethod = CapabilityMethod | "end_turn";

export interface ClaudeCodeCapabilityDescriptor {
  name: ClaudeCodeAdapterMethod;
  rpcMethod: ClaudeCodeAdapterMethod;
  summary: string;
  requiresWindowActivation: boolean;
  inputSchema: ToolInputSchema;
}

export interface ClaudeCodeInvokeMeta extends JsonRpcMeta {
  claudeTurnMetadata?: TurnMetadata;
}

export interface ClaudeCodeInvokeOptions {
  meta?: ClaudeCodeInvokeMeta;
}

export interface ClaudeCodePluginContract {
  host: "claude-code";
  capabilities: readonly ClaudeCodeCapabilityDescriptor[];
  bootstrap(): Promise<void>;
  invoke(
    method: ClaudeCodeAdapterMethod,
    params?: unknown,
    options?: ClaudeCodeInvokeOptions
  ): Promise<unknown>;
  endTurn(meta?: ClaudeCodeInvokeMeta): Promise<void>;
  close(): Promise<void>;
}

export class ClaudeCodeAdapterRpcError extends Error {
  readonly code: string | undefined;
  readonly approvalRequest: ApprovalRequest | undefined;
  readonly details: JsonRpcErrorResponse["details"];
  readonly guidance: JsonRpcErrorResponse["guidance"];
  readonly response: JsonRpcErrorResponse;

  constructor(response: JsonRpcErrorResponse) {
    super(response.error);
    this.name = "ClaudeCodeAdapterRpcError";
    this.code = response.code;
    this.approvalRequest = response.approvalRequest;
    this.details = response.details;
    this.guidance = response.guidance;
    this.response = response;
  }
}
