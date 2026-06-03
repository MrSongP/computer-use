import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  JsonRpcErrorResponse,
  JsonRpcId,
  JsonRpcMeta,
  JsonRpcRequest,
  JsonRpcResponse,
  TurnMetadata
} from "../../core/contracts/rpc.js";
import {
  CodexAdapterRpcError,
  type CodexAdapterMethod,
  type CodexInvokeOptions
} from "./plugin-contract.js";

export interface CodexHelperTransportOptions {
  command?: string;
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  spawnImpl?: typeof spawn;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export class CodexHelperTransport {
  private readonly spawnImpl: typeof spawn;
  private readonly command: string;
  private readonly args: readonly string[];
  private readonly cwd: string | undefined;
  private readonly env: NodeJS.ProcessEnv | undefined;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private child?: ChildProcessWithoutNullStreams;
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private nextId = 1;
  private currentTurnMeta: TurnMetadata | undefined;

  constructor(options: CodexHelperTransportOptions = {}) {
    const launch = resolveHelperLaunch(options);
    this.spawnImpl = options.spawnImpl ?? spawn;
    this.command = launch.command;
    this.args = launch.args;
    this.cwd = launch.cwd;
    this.env = options.env;
  }

  async bootstrap(): Promise<void> {
    this.ensureChild();
  }

  async invoke(
    method: CodexAdapterMethod,
    params: unknown = {},
    options: CodexInvokeOptions = {}
  ): Promise<unknown> {
    if (method === "end_turn") {
      await this.send("end_turn", {}, options.meta);
      this.clearTurnMeta(options.meta?.codexTurnMetadata);
      return null;
    }

    await this.endPreviousTurnIfScopeChanged(options.meta?.codexTurnMetadata);
    const meta = ensureCodexHostMeta(options.meta);
    const result = await this.send(method, params, meta);
    this.currentTurnMeta = meta.codexTurnMetadata;
    return result;
  }

  async close(): Promise<void> {
    if (!this.child) {
      return;
    }

    try {
      await this.send("close", {}, ensureCodexHostMeta({
        codexTurnMetadata: this.currentTurnMeta
      }));
    } catch {
      // Close is best-effort when the helper is already exiting.
    } finally {
      this.currentTurnMeta = undefined;
      this.disposeChild();
    }
  }

  private async endPreviousTurnIfScopeChanged(nextMeta: TurnMetadata | undefined): Promise<void> {
    if (!this.currentTurnMeta) {
      return;
    }

    if (sameTurnScope(this.currentTurnMeta, nextMeta)) {
      return;
    }

    try {
      await this.send("end_turn", {}, ensureCodexHostMeta({
        codexTurnMetadata: this.currentTurnMeta
      }));
    } catch {
      // The upstream helper ignores end_turn failures on scope switches.
    } finally {
      this.currentTurnMeta = undefined;
    }
  }

  private async send(
    method: string,
    params: unknown,
    meta?: JsonRpcMeta
  ): Promise<unknown> {
    const child = this.ensureChild();
    const id = this.nextId++;
    const request: JsonRpcRequest = {
      id,
      method,
      params: params ?? {},
      meta
    };

    return await new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (!error) {
          return;
        }

        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) {
      return this.child;
    }

    const child = this.spawnImpl(this.command, [...this.args], {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.stdoutBuffer += chunk;
      this.flushStdoutBuffer();
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.stderrBuffer += chunk;
      this.stderrBuffer = this.stderrBuffer.slice(-8192);
    });

    child.once("exit", (code, signal) => {
      const error = new Error(formatHelperExit(code, signal, this.stderrBuffer));
      for (const [, pending] of this.pending) {
        pending.reject(error);
      }
      this.pending.clear();
      this.child = undefined;
    });

    child.once("error", (error) => {
      for (const [, pending] of this.pending) {
        pending.reject(error);
      }
      this.pending.clear();
      this.child = undefined;
    });

    return child;
  }

  private flushStdoutBuffer(): void {
    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line.length === 0) {
        continue;
      }

      this.handleResponseLine(line);
    }
  }

  private handleResponseLine(line: string): void {
    let response: JsonRpcResponse;
    try {
      response = JSON.parse(line) as JsonRpcResponse;
    } catch (error) {
      const parseError = error instanceof Error
        ? error
        : new Error(String(error));
      for (const [, pending] of this.pending) {
        pending.reject(
          new Error(`Codex helper returned invalid JSON: ${line}\n${parseError.message}`)
        );
      }
      this.pending.clear();
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }

    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
      return;
    }

    pending.reject(new CodexAdapterRpcError(response as JsonRpcErrorResponse));
  }

  private clearTurnMeta(meta: TurnMetadata | undefined): void {
    if (!this.currentTurnMeta) {
      return;
    }

    if (meta === undefined || sameTurnScope(this.currentTurnMeta, meta)) {
      this.currentTurnMeta = undefined;
    }
  }

  private disposeChild(): void {
    const child = this.child;
    this.child = undefined;
    if (!child || child.killed) {
      return;
    }

    child.stdout.removeAllListeners();
    child.stderr.removeAllListeners();
    child.removeAllListeners();
    child.kill();
  }
}

function ensureCodexHostMeta(meta: JsonRpcMeta | undefined): JsonRpcMeta {
  return {
    ...meta,
    host: "codex"
  };
}

function sameTurnScope(left: TurnMetadata | undefined, right: TurnMetadata | undefined): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.session_id === right.session_id && left.turn_id === right.turn_id;
}

function formatHelperExit(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string
): string {
  const detail = stderr.trim();
  const suffix = detail.length > 0 ? `\n${detail}` : "";
  if (signal) {
    return `Codex helper exited with signal ${signal}.${suffix}`;
  }
  if (code !== null) {
    return `Codex helper exited with code ${code}.${suffix}`;
  }
  return `Codex helper exited unexpectedly.${suffix}`;
}

function resolveHelperLaunch(options: CodexHelperTransportOptions): {
  command: string;
  args: readonly string[];
  cwd?: string;
} {
  if (options.command) {
    return {
      command: options.command,
      args: options.args ?? [],
      cwd: options.cwd
    };
  }

  const helperJs = fileURLToPath(new URL("./helper-entrypoint.js", import.meta.url));
  if (existsSync(helperJs)) {
    return {
      command: process.execPath,
      args: [helperJs],
      cwd: options.cwd ?? resolveProjectRoot(path.dirname(helperJs))
    };
  }

  const helperTs = fileURLToPath(new URL("./helper-entrypoint.ts", import.meta.url));
  if (existsSync(helperTs)) {
    return {
      command: process.execPath,
      args: ["--import", "tsx", helperTs],
      cwd: options.cwd ?? resolveProjectRoot(path.dirname(helperTs))
    };
  }

  throw new Error("Unable to resolve the Codex helper entrypoint.");
}

function resolveProjectRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    const packageJson = path.join(current, "package.json");
    if (existsSync(packageJson)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}
