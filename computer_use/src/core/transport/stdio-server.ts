import readline from "node:readline";
import { EventEmitter } from "node:events";
import type {
  ApprovalRequest,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse
} from "../contracts/rpc.js";
import { JsonRpcCodec } from "./json-rpc.js";
import type { Dispatcher } from "../dispatcher/dispatch.js";
import type { ExecutionContext } from "../runtime/execution-context.js";
import { ESCAPE_ERROR_MESSAGE, isEscapeInterruptError } from "../interrupt/interrupt-error.js";

export interface StdioServerEvents {
  request: [request: JsonRpcRequest];
  parseError: [error: Error];
}

export interface StdioJsonRpcServerOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export class StdioJsonRpcServer extends EventEmitter<StdioServerEvents> {
  private readonly codec = new JsonRpcCodec();
  private readonly output: NodeJS.WritableStream;
  private readonly rl: readline.Interface;

  constructor(private readonly options: StdioJsonRpcServerOptions = {}) {
    super();
    this.output = options.output ?? process.stdout;
    this.rl = readline.createInterface({
      input: options.input ?? process.stdin
    });
    this.rl.on("line", (line) => {
      try {
        this.emit("request", this.codec.parseRequest(line));
      } catch (error) {
        this.emit(
          "parseError",
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });
  }

  send(response: JsonRpcResponse): void {
    this.output.write(`${this.codec.stringifyResponse(response)}\n`);
  }

  sendSuccess(id: JsonRpcId, result: unknown): void {
    this.send({ id, ok: true, result });
  }

  sendError(
    id: JsonRpcId,
    error: string,
    code?: string,
    approvalRequest?: ApprovalRequest
  ): void {
    this.send({
      id,
      ok: false,
      error,
      code,
      approvalRequest
    });
  }

  sendEscapeError(id: JsonRpcId): void {
    this.sendError(id, ESCAPE_ERROR_MESSAGE, "interrupted");
  }

  close(): void {
    this.rl.close();
  }
}

export interface StdioRpcRuntimeOptions {
  exit?: (code: number) => void;
}

export class StdioRpcRuntime {
  private readonly exit: (code: number) => void;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly transport: StdioJsonRpcServer,
    private readonly dispatcher: Dispatcher,
    private readonly runtime: ExecutionContext,
    options: StdioRpcRuntimeOptions = {}
  ) {
    this.exit = options.exit ?? ((code) => process.exitCode = code);
  }

  start(): void {
    this.transport.on("request", (request) => {
      this.pending = this.pending
        .then(() => this.handleRequest(request))
        .catch((error) => {
          throw error;
        });
    });
  }

  async triggerPhysicalEscape(meta?: JsonRpcRequest["meta"]): Promise<void> {
    await this.runtime.endTurn.trigger(meta);
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    try {
      const interruptError = this.runtime.endTurn.check(request.meta);
      if (interruptError) {
        this.transport.sendEscapeError(request.id);
        return;
      }

      if (request.method === "end_turn") {
        await this.runtime.endTurn.close();
        this.transport.sendSuccess(request.id, null);
        return;
      }

      if (request.method === "close") {
        await this.runtime.endTurn.close();
        this.transport.sendSuccess(request.id, null);
        this.transport.close();
        this.exit(0);
        return;
      }

      const response = await this.dispatcher.dispatch(request);
      this.transport.send(response);
    } catch (error) {
      this.transport.send(normalizeRuntimeError(request.id, error));
    }
  }
}

function normalizeRuntimeError(id: JsonRpcId, error: unknown): JsonRpcResponse<null> {
  if (isEscapeInterruptError(error)) {
    return {
      id,
      ok: false,
      code: "interrupted",
      error: ESCAPE_ERROR_MESSAGE
    };
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      message?: unknown;
      code?: unknown;
      approvalRequest?: unknown;
    };

    if (candidate.code === "interrupted") {
      return {
        id,
        ok: false,
        code: "interrupted",
        error: ESCAPE_ERROR_MESSAGE
      };
    }

    return {
      id,
      ok: false,
      error:
        typeof candidate.message === "string" && candidate.message.length > 0
          ? candidate.message
          : "Unexpected runtime error",
      code: typeof candidate.code === "string" ? candidate.code : undefined,
      approvalRequest: isApprovalRequest(candidate.approvalRequest)
        ? candidate.approvalRequest
        : undefined
    };
  }

  return {
    id,
    ok: false,
    error: String(error)
  };
}

function isApprovalRequest(value: unknown): value is ApprovalRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ApprovalRequest>;
  return (
    typeof candidate.app === "string" &&
    typeof candidate.displayName === "string" &&
    (candidate.riskLevel === "low" || candidate.riskLevel === "high")
  );
}
