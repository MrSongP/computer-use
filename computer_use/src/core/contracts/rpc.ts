export type JsonRpcId = number | string;

export interface TurnMetadata {
  session_id: string;
  turn_id: string;
}

export interface JsonRpcMeta {
  codexTurnMetadata?: TurnMetadata;
  "x-oai-cua-request-budget-ms"?: number;
  host?: string;
  computerUseTrace?: {
    enabled?: boolean;
    outputDir?: string;
  };
}

export interface JsonRpcRequest<TParams = unknown> {
  id: JsonRpcId;
  method: string;
  params: TParams;
  meta?: JsonRpcMeta;
}

export interface ApprovalRequest {
  app: string;
  displayName: string;
  riskLevel: "low" | "high";
}

export interface JsonRpcSuccessResponse<TResult = unknown> {
  id: JsonRpcId;
  ok: true;
  result: TResult;
}

export interface JsonRpcErrorResponse {
  id: JsonRpcId;
  ok: false;
  error: string;
  code?: string;
  approvalRequest?: ApprovalRequest;
}

export type JsonRpcResponse<TResult = unknown> =
  | JsonRpcSuccessResponse<TResult>
  | JsonRpcErrorResponse;
