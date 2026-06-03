import { randomUUID } from "node:crypto";
import type { CapabilityMethod } from "../contracts/capability.js";
import type {
  JsonRpcErrorResponse,
  JsonRpcMeta,
  JsonRpcRequest,
  JsonRpcResponse
} from "../contracts/rpc.js";
import type { WindowRef } from "../contracts/window.js";
import type { LifecycleManager } from "../runtime/lifecycle-manager.js";
import type { InterruptState } from "../interrupt/interrupt-state.js";
import type { TraceOptions, ResolvedTraceOptions } from "./trace-config.js";
import { resolveTraceOptions } from "./trace-config.js";
import {
  TraceArtifactWriter,
  type TraceActionLocation,
  type TraceArtifactReference
} from "./artifact-writer.js";

export interface TraceStateSnapshot {
  timestamp: string;
  interrupted: boolean;
  currentTurn: JsonRpcMeta | null;
}

export interface TraceElementInfo {
  elementIndex?: number;
  screenshotId?: string;
}

export interface TraceClickCoordinates {
  x: number | null;
  y: number | null;
  mouseButton?: string;
  clickCount?: number;
}

export interface TraceErrorInfo {
  name: string;
  message: string;
  stack?: string;
  code?: string;
}

export interface TraceResponseInfo {
  ok: boolean;
  code?: string;
  error?: string;
}

export interface ActionTraceEvidence {
  schemaVersion: "computer-use-trace/v1";
  actionId: string;
  actionType: CapabilityMethod;
  requestId: string;
  sessionId: string;
  turnId: string;
  hostSource: string;
  driverName: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "success" | "error";
  trace: {
    enabled: boolean;
    enabledSource: string;
    outputDir: string;
    outputDirSource: string;
  };
  targetWindow: WindowRef | null;
  inputParams: unknown;
  clickCoordinates: TraceClickCoordinates | null;
  elementInfo: TraceElementInfo | null;
  beforeState: TraceStateSnapshot;
  afterState: TraceStateSnapshot;
  screenshots: {
    before: TraceArtifactReference | null;
    after: TraceArtifactReference | null;
  };
  artifacts: TraceArtifactReference[];
  response: TraceResponseInfo | null;
  error: TraceErrorInfo | null;
}

export interface ActionTraceCapture {
  isEnabled(): boolean;
  setTargetWindow(window: WindowRef | null | undefined): void;
  setInputParams(params: unknown): void;
  setClickCoordinates(coordinates: TraceClickCoordinates | null): void;
  setElementInfo(info: TraceElementInfo | null): void;
  attachBeforeScreenshot(reference: TraceArtifactReference | null): void;
  attachAfterScreenshot(reference: TraceArtifactReference | null): void;
  writeJsonArtifact(kind: string, fileName: string, payload: unknown): Promise<TraceArtifactReference | undefined>;
  writeTextArtifact(kind: string, fileName: string, payload: string): Promise<TraceArtifactReference | undefined>;
  writeBinaryArtifact(
    kind: string,
    fileName: string,
    payload: Uint8Array,
    mimeType: string
  ): Promise<TraceArtifactReference | undefined>;
}

export class TraceManager {
  constructor(
    private readonly lifecycle: LifecycleManager,
    private readonly interrupts: InterruptState,
    private readonly driverName: string,
    private readonly config?: TraceOptions
  ) {}

  async runAction<TResult extends JsonRpcResponse<any>>(args: {
    actionType: CapabilityMethod;
    request: JsonRpcRequest;
    execute: (capture: ActionTraceCapture) => Promise<TResult>;
  }): Promise<TResult> {
    const resolved = resolveTraceOptions({
      config: this.config,
      meta: args.request.meta
    });

    const beforeState = this.captureState();
    const actionId = buildActionId(args.actionType, args.request.id);
    const sessionId = resolveSessionId(args.request);
    const turnId = resolveTurnId(args.request);
    const capture = new TraceCapture(resolved, actionId, sessionId, turnId);
    capture.setInputParams(args.request.params);
    const rawWindow = readWindowRef(args.request.params);
    if (rawWindow) {
      capture.setTargetWindow(rawWindow);
    }

    const startedAt = new Date();
    let response: TResult | undefined;
    let error: unknown;

    if (resolved.enabled) {
      await safeTraceWrite(async () => {
        await capture.writeJsonArtifact("request", "request.json", {
          id: args.request.id,
          method: args.request.method,
          meta: args.request.meta ?? null,
          params: args.request.params
        });
      });
    }

    try {
      response = await args.execute(capture);
      return response;
    } catch (cause) {
      error = cause;
      throw cause;
    } finally {
      const endedAt = new Date();
      const afterState = this.captureState();
      if (resolved.enabled) {
        await safeTraceWrite(async () => {
          if (response) {
            await capture.writeJsonArtifact("response", "response.json", response);
          }
          if (error) {
            await capture.writeJsonArtifact("error", "error.json", toErrorInfo(error));
          }

          const evidence: ActionTraceEvidence = {
            schemaVersion: "computer-use-trace/v1",
            actionId,
            actionType: args.actionType,
            requestId: String(args.request.id),
            sessionId,
            turnId,
            hostSource: args.request.meta?.host ?? "unknown",
            driverName: this.driverName,
            startedAt: startedAt.toISOString(),
            endedAt: endedAt.toISOString(),
            durationMs: endedAt.getTime() - startedAt.getTime(),
            status: isErrorResponse(response) || error ? "error" : "success",
            trace: {
              enabled: resolved.enabled,
              enabledSource: resolved.enabledSource,
              outputDir: resolved.outputDir,
              outputDirSource: resolved.outputDirSource
            },
            targetWindow: capture.targetWindow,
            inputParams: capture.inputParams,
            clickCoordinates: capture.clickCoordinates,
            elementInfo: capture.elementInfo,
            beforeState,
            afterState,
            screenshots: {
              before: capture.beforeScreenshot,
              after: capture.afterScreenshot
            },
            artifacts: capture.artifacts,
            response: toResponseInfo(response),
            error: error ? toErrorInfo(error) : toResponseErrorInfo(response)
          };

          await capture.writeJsonArtifact("evidence", "evidence.json", evidence);
        });
      }
    }
  }

  private captureState(): TraceStateSnapshot {
    return {
      timestamp: new Date().toISOString(),
      interrupted: this.interrupts.isInterrupted(),
      currentTurn: cloneForTrace(this.lifecycle.getCurrentTurn() ?? null)
    };
  }
}

class TraceCapture implements ActionTraceCapture {
  targetWindow: WindowRef | null = null;
  inputParams: unknown = null;
  clickCoordinates: TraceClickCoordinates | null = null;
  elementInfo: TraceElementInfo | null = null;
  beforeScreenshot: TraceArtifactReference | null = null;
  afterScreenshot: TraceArtifactReference | null = null;
  readonly artifacts: TraceArtifactReference[] = [];
  private readonly writer?: TraceArtifactWriter;
  private location?: TraceActionLocation;

  constructor(
    private readonly resolved: ResolvedTraceOptions,
    private readonly actionId: string,
    private readonly sessionId: string,
    private readonly turnId: string
  ) {
    if (resolved.enabled) {
      this.writer = new TraceArtifactWriter(resolved.outputDir);
    }
  }

  isEnabled(): boolean {
    return this.writer !== undefined;
  }

  setTargetWindow(window: WindowRef | null | undefined): void {
    this.targetWindow = window ?? null;
  }

  setInputParams(params: unknown): void {
    this.inputParams = cloneForTrace(params);
  }

  setClickCoordinates(coordinates: TraceClickCoordinates | null): void {
    this.clickCoordinates = coordinates ? cloneForTrace(coordinates) as TraceClickCoordinates : null;
  }

  setElementInfo(info: TraceElementInfo | null): void {
    this.elementInfo = info ? cloneForTrace(info) as TraceElementInfo : null;
  }

  attachBeforeScreenshot(reference: TraceArtifactReference | null): void {
    this.beforeScreenshot = reference;
  }

  attachAfterScreenshot(reference: TraceArtifactReference | null): void {
    this.afterScreenshot = reference;
  }

  async writeJsonArtifact(
    kind: string,
    fileName: string,
    payload: unknown
  ): Promise<TraceArtifactReference | undefined> {
    if (!this.writer) {
      return undefined;
    }

    const reference = await this.writer.writeJson(
      await this.getLocation(),
      kind,
      fileName,
      payload
    );
    this.artifacts.push(reference);
    return reference;
  }

  async writeTextArtifact(
    kind: string,
    fileName: string,
    payload: string
  ): Promise<TraceArtifactReference | undefined> {
    if (!this.writer) {
      return undefined;
    }

    const reference = await this.writer.writeText(
      await this.getLocation(),
      kind,
      fileName,
      payload
    );
    this.artifacts.push(reference);
    return reference;
  }

  async writeBinaryArtifact(
    kind: string,
    fileName: string,
    payload: Uint8Array,
    mimeType: string
  ): Promise<TraceArtifactReference | undefined> {
    if (!this.writer) {
      return undefined;
    }

    const reference = await this.writer.writeBinary(
      await this.getLocation(),
      kind,
      fileName,
      payload,
      mimeType
    );
    this.artifacts.push(reference);
    return reference;
  }

  private async getLocation(): Promise<TraceActionLocation> {
    if (!this.location) {
      this.location = await this.writer!.createActionLocation({
        sessionId: this.sessionId,
        turnId: this.turnId,
        actionId: this.actionId
      });
    }

    return this.location;
  }
}

function buildActionId(actionType: CapabilityMethod, requestId: string | number): string {
  return `${actionType}-${String(requestId)}-${randomUUID().slice(0, 8)}`;
}

function resolveSessionId(request: JsonRpcRequest): string {
  return request.meta?.codexTurnMetadata?.session_id ?? "session-unscoped";
}

function resolveTurnId(request: JsonRpcRequest): string {
  return request.meta?.codexTurnMetadata?.turn_id ?? `turn-${String(request.id)}`;
}

function readWindowRef(value: unknown): WindowRef | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = (value as { window?: unknown }).window;
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }

  const windowRef = candidate as Partial<WindowRef>;
  if (typeof windowRef.id !== "number" || typeof windowRef.app !== "string") {
    return null;
  }

  return cloneForTrace(windowRef) as WindowRef;
}

function cloneForTrace<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function toResponseInfo(response: JsonRpcResponse<any> | undefined): TraceResponseInfo | null {
  if (!response) {
    return null;
  }

  if (response.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    code: response.code,
    error: response.error
  };
}

function toResponseErrorInfo(response: JsonRpcResponse<any> | undefined): TraceErrorInfo | null {
  if (!response || response.ok) {
    return null;
  }

  return {
    name: "RpcErrorResponse",
    message: response.error,
    code: response.code
  };
}

function toErrorInfo(error: unknown): TraceErrorInfo {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    name: "NonErrorThrown",
    message: String(error)
  };
}

function isErrorResponse(
  response: JsonRpcResponse<any> | undefined
): response is JsonRpcErrorResponse {
  return Boolean(response && !response.ok);
}

async function safeTraceWrite(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    // Trace is best-effort and must not break the action lane.
  }
}
