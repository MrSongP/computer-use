import type { CapabilityMethod } from "../../core/contracts/capability.js";
import type {
  ApprovalRequest,
  JsonRpcErrorResponse,
  JsonRpcMeta,
  TurnMetadata
} from "../../core/contracts/rpc.js";
import type { ToolInputSchema } from "./tool-schema.js";
import type {
  ToolAnnotations,
  ToolDisclosure
} from "../../core/runtime/tool-disclosure.js";

export type ClaudeCodeAdapterMethod = CapabilityMethod | "end_turn";

export interface ClaudeCodeCapabilityDescriptor {
  name: ClaudeCodeAdapterMethod;
  rpcMethod: ClaudeCodeAdapterMethod;
  title: string;
  summary: string;
  requiresWindowActivation: boolean;
  disclosure: ToolDisclosure;
  annotations: ToolAnnotations;
  inputSchema: ToolInputSchema;
  outputSchema?: ToolInputSchema;
}

export interface ClaudeCodeInvokeMeta extends JsonRpcMeta {
  claudeTurnMetadata?: TurnMetadata;
}

export interface ClaudeCodeInvokeOptions {
  meta?: ClaudeCodeInvokeMeta;
}

export interface ClaudeCodePluginContract {
  host: "claude-code" | "codex";
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
