import readline from "node:readline";
import type { Readable, Writable } from "node:stream";
import { createScaffoldRuntime, createWindowsRuntime } from "../../index.js";
import type { JsonRpcId } from "../../core/contracts/rpc.js";
import type {
  ClaudeCodeAdapterMethod,
  ClaudeCodeCapabilityDescriptor,
  ClaudeCodeInvokeMeta,
  ClaudeCodePluginContract
} from "./plugin-contract.js";
import { ClaudeCodeAdapterRpcError } from "./plugin-contract.js";
import { createClaudeAdapter } from "./index.js";

export const CLAUDE_HELPER_USE_MOCK_BRIDGE_ENV = "COMPUTER_USE_TEST_USE_MOCK_BRIDGE";

export interface ClaudeMcpServerOptions {
  useMockBridge?: boolean;
  input?: Readable;
  output?: Writable;
  exit?: (code: number) => void;
}

interface McpRequest {
  jsonrpc?: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface McpToolCallParams {
  name?: unknown;
  arguments?: unknown;
}

interface ToolCallPayload {
  params: unknown;
  meta?: ClaudeCodeInvokeMeta;
}

export function createClaudeMcpServer(options: ClaudeMcpServerOptions = {}) {
  const scaffold = options.useMockBridge ? createScaffoldRuntime() : createWindowsRuntime();
  const adapter = createClaudeAdapter(scaffold.runtime, scaffold.dispatcher, scaffold.capabilities);
  const server = new ClaudeMcpStdioServer(adapter, {
    input: options.input,
    output: options.output,
    exit: options.exit
  });

  return {
    scaffold,
    adapter,
    server,
    start() {
      server.start();
      return this;
    }
  };
}

export class ClaudeMcpStdioServer {
  private readonly output: Writable;
  private readonly input: Readable;
  private readonly exit: (code: number) => void;
  private rl?: readline.Interface;
  private pending: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly adapter: ClaudeCodePluginContract,
    options: Omit<ClaudeMcpServerOptions, "useMockBridge"> = {}
  ) {
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.exit = options.exit ?? ((code) => process.exitCode = code);
  }

  start(): void {
    this.rl = readline.createInterface({ input: this.input });
    this.rl.on("line", (line) => {
      this.pending = this.pending
        .then(() => this.handleLine(line))
        .catch((error) => {
          this.writeError(undefined, -32603, formatErrorMessage(error));
        });
    });
    this.rl.on("close", () => {
      void this.close();
    });
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    try {
      await this.adapter.close();
    } finally {
      this.rl?.close();
    }
  }

  private async handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }

    let request: McpRequest;
    try {
      request = JSON.parse(trimmed) as McpRequest;
    } catch (error) {
      this.writeError(undefined, -32700, `Invalid JSON: ${formatErrorMessage(error)}`);
      return;
    }

    if (!request.id && request.method === "notifications/initialized") {
      return;
    }

    if (!isMcpRequest(request)) {
      this.writeError(request.id, -32600, "Invalid MCP request.");
      return;
    }

    switch (request.method) {
      case "initialize":
        this.writeResult(request.id, {
          protocolVersion: readProtocolVersion(request.params),
          capabilities: {
            tools: {
              listChanged: false
            }
          },
          serverInfo: {
            name: "computer-use",
            version: "0.1.0"
          }
        });
        return;

      case "ping":
        this.writeResult(request.id, {});
        return;

      case "tools/list":
        this.writeResult(request.id, {
          tools: this.adapter.capabilities.map(toMcpToolDescriptor)
        });
        return;

      case "tools/call":
        this.writeResult(request.id, await this.handleToolCall(request.params));
        return;

      case "shutdown":
        await this.adapter.close();
        this.writeResult(request.id, {});
        return;

      case "close":
        await this.close();
        this.writeResult(request.id, {});
        this.exit(0);
        return;

      default:
        this.writeError(request.id, -32601, `Unknown MCP method: ${request.method}`);
    }
  }

  private async handleToolCall(params: unknown): Promise<unknown> {
    if (!isRecord(params)) {
      return toolError("tools/call params must be an object.");
    }

    const call = params as McpToolCallParams;
    if (typeof call.name !== "string") {
      return toolError("tools/call requires a tool name.");
    }

    const method = call.name as ClaudeCodeAdapterMethod;
    if (!this.adapter.capabilities.some((capability) => capability.name === method)) {
      return toolError(`Unknown computer-use tool: ${call.name}`);
    }

    const payload = extractToolCallPayload(call.arguments);
    try {
      const result = await this.adapter.invoke(method, payload.params, {
        meta: payload.meta
      });
      return toolResult(method, result);
    } catch (error) {
      if (error instanceof ClaudeCodeAdapterRpcError) {
        return toolError({
          error: error.message,
          code: error.code,
          approvalRequest: error.approvalRequest,
          details: error.details,
          guidance: error.guidance
        });
      }

      return toolError(toToolErrorPayload(error));
    }
  }

  private writeResult(id: JsonRpcId, result: unknown): void {
    this.output.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  }

  private writeError(id: JsonRpcId | undefined, code: number, message: string): void {
    this.output.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code,
        message
      }
    })}\n`);
  }
}

function isMcpRequest(value: unknown): value is McpRequest & { id: JsonRpcId } {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (typeof value.id === "number" || typeof value.id === "string") &&
    typeof value.method === "string"
  );
}

function toMcpToolDescriptor(capability: ClaudeCodeCapabilityDescriptor): unknown {
  const descriptor: Record<string, unknown> = {
    name: capability.name,
    description: capability.summary,
    inputSchema: capability.inputSchema
  };
  if (capability.outputSchema) {
    descriptor.outputSchema = capability.outputSchema;
  }

  return descriptor;
}

function extractToolCallPayload(args: unknown): ToolCallPayload {
  if (!isRecord(args)) {
    return { params: {} };
  }

  const input = { ...args };
  const explicitMeta = readMeta(input.meta);
  delete input.meta;

  const meta: ClaudeCodeInvokeMeta = {
    ...(explicitMeta ?? {}),
    claudeTurnMetadata: readTurnMetadata(input.claudeTurnMetadata),
    codexTurnMetadata: readTurnMetadata(input.codexTurnMetadata) ?? explicitMeta?.codexTurnMetadata,
    computerUseStatus: readStatusMeta(input.computerUseStatus) ?? explicitMeta?.computerUseStatus,
    computerUseTrace: readTraceMeta(input.computerUseTrace) ?? explicitMeta?.computerUseTrace
  };

  delete input.claudeTurnMetadata;
  delete input.codexTurnMetadata;
  delete input.computerUseStatus;
  delete input.computerUseTrace;

  return {
    params: input,
    meta: hasAnyKey(meta) ? meta : undefined
  };
}

function readMeta(value: unknown): ClaudeCodeInvokeMeta | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    ...value,
    claudeTurnMetadata: readTurnMetadata(value.claudeTurnMetadata),
    codexTurnMetadata: readTurnMetadata(value.codexTurnMetadata),
    computerUseStatus: readStatusMeta(value.computerUseStatus),
    computerUseTrace: readTraceMeta(value.computerUseTrace)
  };
}

function readTurnMetadata(value: unknown): ClaudeCodeInvokeMeta["claudeTurnMetadata"] {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.session_id !== "string" || typeof value.turn_id !== "string") {
    return undefined;
  }

  return {
    session_id: value.session_id,
    turn_id: value.turn_id
  };
}

function readTraceMeta(value: unknown): ClaudeCodeInvokeMeta["computerUseTrace"] {
  if (!isRecord(value)) {
    return undefined;
  }

  const trace: ClaudeCodeInvokeMeta["computerUseTrace"] = {};
  if (typeof value.enabled === "boolean") {
    trace.enabled = value.enabled;
  }
  if (typeof value.outputDir === "string") {
    trace.outputDir = value.outputDir;
  }
  return hasAnyKey(trace) ? trace : undefined;
}

function readStatusMeta(value: unknown): ClaudeCodeInvokeMeta["computerUseStatus"] {
  if (!isRecord(value)) {
    return undefined;
  }

  const status: ClaudeCodeInvokeMeta["computerUseStatus"] = {};
  if (typeof value.title === "string" && value.title.trim().length > 0) {
    status.title = value.title.trim();
  }
  if (typeof value.detail === "string" && value.detail.trim().length > 0) {
    status.detail = value.detail.trim();
  }
  return hasAnyKey(status) ? status : undefined;
}

function toolResult(method: ClaudeCodeAdapterMethod, result: unknown): unknown {
  const sanitizedPayload = redactToolResultForText(result);
  const content: Array<Record<string, unknown>> = [];

  const screenshot = readScreenshotContent(result);
  if (screenshot) {
    content.push({
      type: "image",
      data: screenshot.data,
      mimeType: screenshot.mime
    });
  }

  content.push({
    type: "text",
    text: sanitizedPayload === undefined ? "null" : JSON.stringify(sanitizedPayload)
  });

  const response: Record<string, unknown> = { content };
  const structuredContent = method === "get_window_state"
    ? null
    : toStructuredContent(method, sanitizedPayload);
  if (structuredContent) {
    response.structuredContent = structuredContent;
  }

  return response;
}

function toStructuredContent(
  method: ClaudeCodeAdapterMethod,
  value: unknown
): Record<string, unknown> | null {
  if (isRecord(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    if (method === "list_windows") {
      return { windows: value };
    }

    return { items: value };
  }

  return null;
}

function toolError(error: unknown): unknown {
  const errorPayload = typeof error === "string" ? { error } : error;
  const result: Record<string, unknown> = {
    content: [
      {
        type: "text",
        text: typeof errorPayload === "string" ? errorPayload : JSON.stringify(errorPayload)
      }
    ],
    isError: true
  };
  if (isRecord(errorPayload)) {
    result.structuredContent = errorPayload;
  }
  return {
    ...result
  };
}

function toToolErrorPayload(error: unknown): unknown {
  if (!isRecord(error)) {
    return formatErrorMessage(error);
  }

  const message = error.message;
  const payload: Record<string, unknown> = {
    error: typeof message === "string" && message.length > 0
      ? message
      : formatErrorMessage(error)
  };
  if (typeof error.code === "string") {
    payload.code = error.code;
  }
  if (isRecord(error.approvalRequest)) {
    payload.approvalRequest = error.approvalRequest;
  }
  if (isRecord(error.details)) {
    payload.details = error.details;
  }
  if (isRecord(error.guidance)) {
    payload.guidance = error.guidance;
  }

  return Object.keys(payload).length > 1 ? payload : payload.error;
}

function readProtocolVersion(params: unknown): string {
  if (isRecord(params) && typeof params.protocolVersion === "string") {
    return params.protocolVersion;
  }

  return "2024-11-05";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readScreenshotContent(value: unknown): { data: string; mime: string } | null {
  if (!isRecord(value) || !isRecord(value.screenshot)) {
    return null;
  }

  const screenshot = value.screenshot;
  if (typeof screenshot.data !== "string" || typeof screenshot.mime !== "string") {
    return null;
  }

  return {
    data: screenshot.data,
    mime: screenshot.mime
  };
}

function redactToolResultForText(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.screenshot)) {
    return value;
  }

  const screenshot = value.screenshot;
  const byteLength = typeof screenshot.byteLength === "number" ? screenshot.byteLength : null;
  const raw = isRecord(screenshot.raw) ? screenshot.raw : undefined;
  const rawByteLength = raw && typeof raw.byteLength === "number" ? raw.byteLength : null;

  return {
    ...value,
    screenshot: {
      ...screenshot,
      data: byteLength === null ? "<base64>" : `<base64:${byteLength} bytes>`,
      raw: raw
        ? {
            ...raw,
            data: rawByteLength === null ? "<base64>" : `<base64:${rawByteLength} bytes>`
          }
        : undefined
    }
  };
}

function hasAnyKey(value: object): boolean {
  return Object.keys(value).length > 0;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
