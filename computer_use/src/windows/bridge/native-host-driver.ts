import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";
import type { JsonRpcMeta } from "../../core/contracts/rpc.js";
import type { AppDescriptor, AppIdentifier } from "../../core/contracts/app.js";
import type { WindowStateParams, WindowStateResult } from "../../core/contracts/capture.js";
import type { GetWindowParams } from "../../core/contracts/discovery.js";
import type {
  ClickElementParams,
  PerformSecondaryActionParams,
  SetValueParams
} from "../../core/contracts/action.js";
import type { WindowRef } from "../../core/contracts/window.js";
import { resolveVirtualScreenMetrics, type VirtualScreenMetrics } from "../input/pointer-primitives.js";
import type { KeyboardInput, PointerClick, PointerDrag, PointerScroll } from "../shared/win32-types.js";
import type { NativeAppLaunchOptions, NativeBridge } from "./native-bridge.js";
import { PowerShellNativeBridge } from "./powershell-driver.js";

const execFileAsync = promisify(execFile);
const DEFAULT_BUILD_CONFIGURATION = "Release";
const NATIVE_HOST_TARGET_FRAMEWORK = "net8.0-windows";
const FRAMEWORK64_CSC_PATH = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
const FRAMEWORK32_CSC_PATH = "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe";
const FRAMEWORK64_WPF_PATH = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\WPF";
const FRAMEWORK32_WPF_PATH = "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\WPF";
const FRAMEWORK64_DIR = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319";
const FRAMEWORK32_DIR = "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319";
const WINDOWS_WINMD_CANDIDATES = [
  "C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata\\10.0.26100.0\\Windows.winmd",
  "C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata\\Facade\\Windows.WinMD",
  "C:\\Program Files (x86)\\Windows Kits\\8.1\\References\\CommonConfiguration\\Neutral\\Annotated\\Windows.winmd"
] as const;
const DEFAULT_PROJECT_PATH = resolveNativeHostPath(
  "../../../native-host/ComputerUse.NativeHost/ComputerUse.NativeHost.csproj",
  "../../../../native-host/ComputerUse.NativeHost/ComputerUse.NativeHost.csproj"
);
const DEFAULT_PROGRAM_PATH = resolveNativeHostPath(
  "../../../native-host/ComputerUse.NativeHost/Program.cs",
  "../../../../native-host/ComputerUse.NativeHost/Program.cs"
);

interface NativeHostRequest {
  id: number;
  method: string;
  payload: Record<string, unknown>;
}

interface NativeHostResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
  guidance?: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface NativeHostBridgeOptions {
  buildConfiguration?: string;
  buildTimeoutMs?: number;
  dotnetExecutable?: string;
  driverName?: string;
  fallback?: NativeBridge;
  projectPath?: string;
  requestTimeoutMs?: number;
  sourcePath?: string;
  startupTimeoutMs?: number;
}

export class NativeHostBridge implements NativeBridge {
  readonly driverName: string;
  readonly capabilities = {
    activationModel: {
      supportsAttachThreadInput: true,
      approximatesThreadInputAttachment: false,
      supportsDesktopSwitching: true,
      supportsSyntheticEscapeUnlock: true,
      supportsSyntheticAltUnlock: true,
      foregroundRetryCount: 20,
      unlockSequence: ["escape", "alt"] as const
    },
    pointerModel: {
      usesVirtualScreenCoordinates: true,
      providesVirtualScreenMetrics: true,
      dpiAwareness: "per-monitor-v2" as const
    },
    lifecycleModel: {
      supportsPhysicalEscapeHook: true,
      supportsInterruptMarkers: true,
      transport: "embedded" as const
    }
  };

  private readonly buildConfiguration: string;
  private readonly buildTimeoutMs: number;
  private readonly dotnetExecutable?: string;
  private readonly fallback: NativeBridge;
  private readonly projectPath: string;
  private readonly requestTimeoutMs: number;
  private readonly sourcePath: string;
  private readonly startupTimeoutMs: number;
  private currentTurnMeta?: JsonRpcMeta;
  private fallbackActive = false;
  private fallbackTurnStarted = false;
  private hostProcess?: ChildProcessWithoutNullStreams;
  private hostStartup?: Promise<ChildProcessWithoutNullStreams>;
  private lifecycleError?: Error;
  private pendingRequests = new Map<number, PendingRequest>();
  private queued: Promise<void> = Promise.resolve();
  private requestId = 0;
  private stderrTail = "";
  private turnStarted = false;

  constructor(options: NativeHostBridgeOptions = {}) {
    this.buildConfiguration = options.buildConfiguration ?? DEFAULT_BUILD_CONFIGURATION;
    this.buildTimeoutMs = options.buildTimeoutMs ?? 30_000;
    this.dotnetExecutable = options.dotnetExecutable ?? process.env.COMPUTER_USE_DOTNET_PATH;
    this.driverName = options.driverName ?? "native-host";
    this.fallback = options.fallback ?? new PowerShellNativeBridge();
    this.projectPath = options.projectPath ?? DEFAULT_PROJECT_PATH;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 20_000;
    this.sourcePath = options.sourcePath ?? DEFAULT_PROGRAM_PATH;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 15_000;
  }

  beginTurn(meta?: JsonRpcMeta): void {
    this.currentTurnMeta = meta;
    this.turnStarted = false;
    this.lifecycleError = undefined;

    if (this.fallbackActive) {
      this.fallback.beginTurn(meta);
      this.fallbackTurnStarted = true;
      return;
    }

    this.fallbackTurnStarted = false;
  }

  endTurn(): void {
    const turnMeta = this.currentTurnMeta;
    this.currentTurnMeta = undefined;

    if (this.fallbackActive) {
      if (this.fallbackTurnStarted) {
        this.fallback.endTurn();
      }
      this.fallbackTurnStarted = false;
      return;
    }

    const endTurnTask = this.enqueue(async () => {
      try {
        if (this.turnStarted) {
          await this.invokeHost("endTurn", { meta: turnMeta ?? null });
        }
      } finally {
        this.turnStarted = false;
        this.disposeHostProcess();
      }
    });

    void endTurnTask.catch((error) => {
      this.lifecycleError = normalizeUnknownError(error);
    });
  }

  async activateWindow(window: WindowRef): Promise<void> {
    return this.invokeOrFallback(
      () => this.invokePrimary("activateWindow", { window, meta: this.currentTurnMeta ?? null }),
      () => this.invokeFallback(() => this.fallback.activateWindow(window))
    );
  }

  async sendText(text: string): Promise<void> {
    return this.invokeOrFallback(
      () => this.invokePrimary("sendText", { text, meta: this.currentTurnMeta ?? null }),
      () => this.invokeFallback(() => this.fallback.sendText(text))
    );
  }

  async sendKeyboardInputs(inputs: readonly KeyboardInput[]): Promise<void> {
    return this.invokeOrFallback(
      () => this.invokePrimary("sendKeyboardInputs", { inputs, meta: this.currentTurnMeta ?? null }),
      () => this.invokeFallback(() => this.fallback.sendKeyboardInputs(inputs))
    );
  }

  async sendPointerClick(click: PointerClick): Promise<void> {
    return this.invokeOrFallback(
      () => this.invokePrimary("sendPointerClick", { click, meta: this.currentTurnMeta ?? null }),
      () => this.invokeFallback(() => this.fallback.sendPointerClick(click))
    );
  }

  async sendPointerScroll(scroll: PointerScroll): Promise<void> {
    return this.invokeOrFallback(
      () => this.invokePrimary("sendPointerScroll", { scroll, meta: this.currentTurnMeta ?? null }),
      () => this.invokeFallback(() => this.fallback.sendPointerScroll(scroll))
    );
  }

  async sendPointerDrag(drag: PointerDrag): Promise<void> {
    return this.invokeOrFallback(
      () => this.invokePrimary("sendPointerDrag", { drag, meta: this.currentTurnMeta ?? null }),
      () => this.invokeFallback(() => this.fallback.sendPointerDrag(drag))
    );
  }

  async getVirtualScreenMetrics(): Promise<VirtualScreenMetrics> {
    try {
      const result = await this.invokeOrFallbackWithResult<VirtualScreenMetrics>(
        () => this.invokePrimaryResult<VirtualScreenMetrics>("getVirtualScreenMetrics", {
          meta: this.currentTurnMeta ?? null
        }),
        async () => resolveVirtualScreenMetrics()
      );
      return resolveVirtualScreenMetrics(result);
    } catch {
      return resolveVirtualScreenMetrics();
    }
  }

  async listWindows(): Promise<readonly WindowRef[]> {
    return await this.invokeOrFallbackWithResult<readonly WindowRef[]>(
      () => this.invokePrimaryResult<readonly WindowRef[]>("listWindows", { meta: this.currentTurnMeta ?? null }),
      () => this.fallback.listWindows()
    );
  }

  async getWindow(params: GetWindowParams): Promise<WindowRef> {
    return await this.invokeOrFallbackWithResult<WindowRef>(
      () => this.invokePrimaryResult<WindowRef>("getWindow", { params, meta: this.currentTurnMeta ?? null }),
      () => this.fallback.getWindow(params)
    );
  }

  async listApps(): Promise<readonly AppDescriptor[]> {
    return await this.invokeOrFallbackWithResult<readonly AppDescriptor[]>(
      () => this.invokePrimaryResult<readonly AppDescriptor[]>("listApps", { meta: this.currentTurnMeta ?? null }),
      () => this.fallback.listApps()
    );
  }

  async launchApp(app: AppIdentifier, options?: NativeAppLaunchOptions): Promise<void> {
    return this.invokeOrFallback(
      () => this.invokePrimary("launchApp", {
        app,
        launchMode: options?.launchMode ?? null,
        meta: this.currentTurnMeta ?? null
      }),
      () => this.invokeFallback(() => this.fallback.launchApp(app, options))
    );
  }

  async getWindowState(params: WindowStateParams): Promise<WindowStateResult> {
    return await this.invokeOrFallbackWithResult<WindowStateResult>(
      () => this.invokePrimaryResult<WindowStateResult>("getWindowState", { params, meta: this.currentTurnMeta ?? null }),
      () => this.fallback.getWindowState(params)
    );
  }

  async clickElement(params: ClickElementParams): Promise<void> {
    return this.invokeOrFallback(
      () => this.invokePrimary("clickElement", { params, meta: this.currentTurnMeta ?? null }),
      () => this.invokeFallback(() => this.fallback.clickElement(params))
    );
  }

  async setValue(params: SetValueParams): Promise<void> {
    return this.invokeOrFallback(
      () => this.invokePrimary("setValue", { params, meta: this.currentTurnMeta ?? null }),
      () => this.invokeFallback(() => this.fallback.setValue(params))
    );
  }

  async performSecondaryAction(params: PerformSecondaryActionParams): Promise<void> {
    return this.invokeOrFallback(
      () => this.invokePrimary("performSecondaryAction", { params, meta: this.currentTurnMeta ?? null }),
      () => this.invokeFallback(() => this.fallback.performSecondaryAction(params))
    );
  }

  protected async invokePrimary(method: string, payload: Record<string, unknown>): Promise<void> {
    if (this.lifecycleError) {
      throw this.lifecycleError;
    }

    await this.enqueue(async () => {
      await this.ensureTurnStarted();
      await this.invokeHost(method, payload);
    });
  }

  protected async invokePrimaryResult<TResult>(
    method: string,
    payload: Record<string, unknown>
  ): Promise<TResult> {
    if (this.lifecycleError) {
      throw this.lifecycleError;
    }

    return await this.enqueue(async () => {
      await this.ensureTurnStarted();
      return await this.invokeHost(method, payload) as TResult;
    });
  }

  protected async invokeFallback(operation: () => Promise<void>): Promise<void> {
    if (!this.fallbackTurnStarted) {
      this.fallback.beginTurn(this.currentTurnMeta);
      this.fallbackTurnStarted = true;
    }

    await operation();
  }

  private async ensureTurnStarted(): Promise<void> {
    if (this.turnStarted) {
      return;
    }

    await this.invokeHost("beginTurn", { meta: this.currentTurnMeta ?? null });
    this.turnStarted = true;
  }

  private async invokeOrFallback(
    primary: () => Promise<void>,
    fallback: () => Promise<void>
  ): Promise<void> {
    if (this.fallbackActive) {
      await fallback();
      return;
    }

    try {
      await primary();
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      if (!shouldFallback(normalized)) {
        throw normalized;
      }

      await this.activateFallback();
      try {
        await fallback();
      } catch (fallbackError) {
        throw combineFallbackFailure(normalized, fallbackError);
      }
    }
  }

  private async invokeOrFallbackWithResult<TResult>(
    primary: () => Promise<TResult>,
    fallback: () => Promise<TResult>
  ): Promise<TResult> {
    if (this.fallbackActive) {
      return await fallback();
    }

    try {
      return await primary();
    } catch (error) {
      const normalized = normalizeUnknownError(error);
      if (!shouldFallback(normalized)) {
        throw normalized;
      }

      await this.activateFallback();
      try {
        return await fallback();
      } catch (fallbackError) {
        throw combineFallbackFailure(normalized, fallbackError);
      }
    }
  }

  private async activateFallback(): Promise<void> {
    this.fallbackActive = true;
    this.turnStarted = false;
    this.lifecycleError = undefined;
    this.disposeHostProcess();

    if (!this.fallbackTurnStarted) {
      this.fallback.beginTurn(this.currentTurnMeta);
      this.fallbackTurnStarted = true;
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queued.then(task, task);
    this.queued = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private async invokeHost(method: string, payload: Record<string, unknown>): Promise<unknown> {
    const processHandle = await this.ensureHostProcess();
    const id = ++this.requestId;
    const request: NativeHostRequest = { id, method, payload };

    return await new Promise<unknown>((resolve, reject) => {
      let settled = false;
      const finalize = <T>(callback: (value: T) => void) => (value: T) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutHandle);
        callback(value);
      };
      const timeoutHandle = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        this.pendingRequests.delete(id);
        const stderrSuffix = formatStderrSuffix(this.stderrTail);
        reject(
          new NativeHostTransportError(
            `Timed out waiting ${this.requestTimeoutMs}ms for native host response to '${method}'.${stderrSuffix}`
          )
        );
        this.disposeHostProcess();
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve: finalize(resolve),
        reject: finalize(reject)
      });

      const serialized = JSON.stringify(request);
      processHandle.stdin.write(`${serialized}\n`, "utf8", (writeError) => {
        if (!writeError) {
          return;
        }

        const pending = this.pendingRequests.get(id);
        this.pendingRequests.delete(id);
        if (!pending) {
          return;
        }

        pending.reject(
          new NativeHostTransportError(`Failed to write ${method} to the native host: ${writeError.message}`)
        );
      });
    });
  }

  private async ensureHostProcess(): Promise<ChildProcessWithoutNullStreams> {
    if (this.hostProcess && !this.hostProcess.killed) {
      return this.hostProcess;
    }

    if (!this.hostStartup) {
      this.hostStartup = this.launchHostProcess();
    }

    return await this.hostStartup;
  }

  private async launchHostProcess(): Promise<ChildProcessWithoutNullStreams> {
    const launchSpec = await ensureNativeHostAssembly({
      buildConfiguration: this.buildConfiguration,
      buildTimeoutMs: this.buildTimeoutMs,
      dotnetExecutable: this.dotnetExecutable,
      projectPath: this.projectPath,
      sourcePath: this.sourcePath
    });

    const child = spawn(launchSpec.command, [...launchSpec.args], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    child.stdin.setDefaultEncoding("utf8");
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    const lineReader = readline.createInterface({ input: child.stdout });
    lineReader.on("line", (line) => {
      this.handleHostResponse(line);
    });

    child.stderr.on("data", (chunk: string | Buffer) => {
      this.recordStderr(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });

    child.once("error", (error) => {
      const wrapped = new NativeHostTransportError(`Native host process failed to start: ${error.message}`);
      this.failPendingRequests(wrapped);
      this.disposeHostProcess();
    });

    child.once("exit", (code, signal) => {
      const suffix = this.stderrTail.trim().length > 0 ? `\nstderr: ${this.stderrTail.trim()}` : "";
      const wrapped = new NativeHostTransportError(
        `Native host process exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"}).${suffix}`
      );
      this.failPendingRequests(wrapped);
      this.disposeHostProcess();
    });

    this.hostProcess = child;
    this.hostStartup = undefined;

    await this.pingHost(child);
    return child;
  }

  private async pingHost(child: ChildProcessWithoutNullStreams): Promise<void> {
    const timeout = setTimeout(() => {
      this.failPendingRequests(
        new NativeHostTransportError(
          `Timed out waiting for the native host handshake after ${this.startupTimeoutMs}ms.`
        )
      );
      child.kill();
    }, this.startupTimeoutMs);

    try {
      await new Promise<void>((resolve, reject) => {
        const id = ++this.requestId;
        this.pendingRequests.set(id, {
          resolve: () => resolve(),
          reject
        });

        child.stdin.write(`${JSON.stringify({ id, method: "ping", payload: {} })}\n`, "utf8", (error) => {
          if (!error) {
            return;
          }

          this.pendingRequests.delete(id);
          reject(new NativeHostTransportError(`Failed to send native-host ping: ${error.message}`));
        });
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private handleHostResponse(line: string): void {
    let response: NativeHostResponse;
    try {
      response = JSON.parse(line) as NativeHostResponse;
    } catch (error) {
      this.failPendingRequests(
        new NativeHostTransportError(
          `Native host returned invalid JSON: ${line}\n${normalizeUnknownError(error).message}`
        )
      );
      return;
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
      return;
    }

    pending.reject(
      new NativeHostCommandError(
        response.error ?? "Native host command failed.",
        response.code,
        response.details,
        response.guidance
      )
    );
  }

  private failPendingRequests(error: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      this.pendingRequests.delete(id);
      pending.reject(error);
    }
  }

  private recordStderr(stderrChunk: string): void {
    this.stderrTail = `${this.stderrTail}${stderrChunk}`.slice(-8_192);
  }

  private disposeHostProcess(): void {
    const processHandle = this.hostProcess;
    this.hostProcess = undefined;
    this.hostStartup = undefined;

    if (processHandle && !processHandle.killed) {
      processHandle.kill();
    }
  }
}

interface NativeHostAssemblyOptions {
  buildConfiguration: string;
  buildTimeoutMs: number;
  cscExecutable?: string;
  dotnetExecutable?: string;
  projectPath: string;
  sourcePath: string;
}

interface NativeHostLaunchSpec {
  command: string;
  args: readonly string[];
}

async function ensureNativeHostAssembly(options: NativeHostAssemblyOptions): Promise<NativeHostLaunchSpec> {
  const cscExecutable = await resolveCscExecutable(options.cscExecutable);
  if (cscExecutable) {
    const executablePath = getNativeHostExecutablePath(options.projectPath, options.buildConfiguration);
    if (await shouldBuildNativeHost(executablePath, options.projectPath, options.sourcePath)) {
      await mkdir(path.dirname(executablePath), { recursive: true });

      try {
        await compileNativeHostWithCsc(cscExecutable, executablePath, options);
      } catch (error) {
        const fallbackExecutablePath = getFallbackNativeHostExecutablePath(
          options.projectPath,
          options.buildConfiguration
        );
        try {
          await compileNativeHostWithCsc(cscExecutable, fallbackExecutablePath, options);
          return {
            command: fallbackExecutablePath,
            args: []
          };
        } catch (fallbackError) {
          throw new NativeHostBuildError(
            `Failed to compile the native host with csc.exe: ${formatExecError(error)}` +
            `\nFallback compile failed: ${formatExecError(fallbackError)}`
          );
        }
      }
    }

    return {
      command: executablePath,
      args: []
    };
  }

  const assemblyPath = getNativeHostAssemblyPath(options.projectPath, options.buildConfiguration);
  if (await shouldBuildNativeHost(assemblyPath, options.projectPath, options.sourcePath)) {
    try {
      await execFileAsync(
        options.dotnetExecutable ?? process.env.COMPUTER_USE_DOTNET_PATH ?? "dotnet",
        ["build", options.projectPath, "-c", options.buildConfiguration, "--nologo"],
        {
          cwd: path.dirname(options.projectPath),
          timeout: options.buildTimeoutMs,
          windowsHide: true
        }
      );
    } catch (error) {
      throw new NativeHostBuildError(`Failed to build the native host: ${formatExecError(error)}`);
    }
  }

  return {
    command: options.dotnetExecutable ?? process.env.COMPUTER_USE_DOTNET_PATH ?? "dotnet",
    args: [assemblyPath]
  };
}

async function shouldBuildNativeHost(
  assemblyPath: string,
  projectPath: string,
  sourcePath: string
): Promise<boolean> {
  try {
    const [assemblyStat, projectStat, programStat] = await Promise.all([
      stat(assemblyPath),
      stat(projectPath),
      stat(sourcePath)
    ]);
    const newestSource = Math.max(projectStat.mtimeMs, programStat.mtimeMs);
    return newestSource > assemblyStat.mtimeMs;
  } catch {
    return true;
  }
}

function getNativeHostAssemblyPath(projectPath: string, buildConfiguration: string): string {
  return path.join(
    path.dirname(projectPath),
    "bin",
    buildConfiguration,
    NATIVE_HOST_TARGET_FRAMEWORK,
    "ComputerUse.NativeHost.dll"
  );
}

function getNativeHostExecutablePath(projectPath: string, buildConfiguration: string): string {
  return path.join(path.dirname(projectPath), "bin", buildConfiguration, "ComputerUse.NativeHost.exe");
}

function getFallbackNativeHostExecutablePath(projectPath: string, buildConfiguration: string): string {
  return path.join(
    path.dirname(projectPath),
    "bin",
    buildConfiguration,
    `ComputerUse.NativeHost.${process.pid}.${Date.now()}.exe`
  );
}

async function compileNativeHostWithCsc(
  cscExecutable: string,
  executablePath: string,
  options: NativeHostAssemblyOptions
): Promise<void> {
  const references = await resolveCscReferences();
  await execFileAsync(
    cscExecutable,
    [
      "/nologo",
      "/target:exe",
      `/out:${executablePath}`,
      "/r:System.Web.Extensions.dll",
      "/r:System.Drawing.dll",
      ...references.map((reference) => `/r:${reference}`),
      options.sourcePath
    ],
    {
      cwd: path.dirname(options.projectPath),
      timeout: options.buildTimeoutMs,
      windowsHide: true
    }
  );
}

function resolveNativeHostPath(...relativeCandidates: readonly string[]): string {
  for (const candidate of relativeCandidates) {
    const resolved = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  return fileURLToPath(new URL(relativeCandidates[0]!, import.meta.url));
}

async function resolveCscExecutable(preferred?: string): Promise<string | undefined> {
  const candidates = [
    preferred,
    process.env.COMPUTER_USE_CSC_PATH,
    FRAMEWORK64_CSC_PATH,
    FRAMEWORK32_CSC_PATH
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
}

async function resolveCscReferences(): Promise<readonly string[]> {
  const frameworkCandidates = [
    { frameworkDir: FRAMEWORK64_DIR, wpfDir: FRAMEWORK64_WPF_PATH },
    { frameworkDir: FRAMEWORK32_DIR, wpfDir: FRAMEWORK32_WPF_PATH }
  ];
  const windowsWinMd = await resolveFirstExistingPath(WINDOWS_WINMD_CANDIDATES);

  for (const candidate of frameworkCandidates) {
    const references = [
      path.join(candidate.frameworkDir, "System.Runtime.dll"),
      path.join(candidate.frameworkDir, "System.Runtime.InteropServices.WindowsRuntime.dll"),
      path.join(candidate.frameworkDir, "System.Runtime.WindowsRuntime.dll"),
      path.join(candidate.wpfDir, "UIAutomationClient.dll"),
      path.join(candidate.wpfDir, "UIAutomationTypes.dll"),
      path.join(candidate.wpfDir, "WindowsBase.dll"),
      windowsWinMd
    ].filter((reference): reference is string => typeof reference === "string" && reference.length > 0);

    if (await allFilesExist(references)) {
      return references;
    }
  }

  return [
    "System.Runtime.dll",
    "System.Runtime.InteropServices.WindowsRuntime.dll",
    "System.Runtime.WindowsRuntime.dll",
    "UIAutomationClient.dll",
    "UIAutomationTypes.dll",
    "WindowsBase.dll",
    "Windows.winmd"
  ];
}

async function allFilesExist(files: readonly string[]): Promise<boolean> {
  for (const file of files) {
    try {
      await stat(file);
    } catch {
      return false;
    }
  }

  return true;
}

async function resolveFirstExistingPath(candidates: readonly string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
}

function formatExecError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown process failure.";
  }

  const details = [error.message];
  if ("stderr" in error && typeof error.stderr === "string" && error.stderr.trim().length > 0) {
    details.push(`stderr: ${error.stderr.trim()}`);
  }
  if ("stdout" in error && typeof error.stdout === "string" && error.stdout.trim().length > 0) {
    details.push(`stdout: ${error.stdout.trim()}`);
  }

  return details.join("\n");
}

function normalizeUnknownError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function combineFallbackFailure(primaryError: Error, fallbackError: unknown): Error {
  const normalizedFallback = normalizeUnknownError(fallbackError);
  return new Error(
    `${primaryError.message}\nFallback failed: ${normalizedFallback.message}`
  );
}

function formatStderrSuffix(stderr: string): string {
  const detail = stderr.trim();
  return detail.length > 0 ? `\nstderr: ${detail}` : "";
}

function shouldFallback(error: Error): boolean {
  return error instanceof NativeHostBuildError || error instanceof NativeHostTransportError;
}

export class NativeHostBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NativeHostBuildError";
  }
}

export class NativeHostTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NativeHostTransportError";
  }
}

export class NativeHostCommandError extends Error {
  readonly code?: string;
  readonly details?: Record<string, unknown>;
  readonly guidance?: Record<string, unknown>;

  constructor(
    message: string,
    code?: string,
    details?: Record<string, unknown>,
    guidance?: Record<string, unknown>
  ) {
    super(formatNativeHostCommandError(message, code, details, guidance));
    this.name = "NativeHostCommandError";
    this.code = code;
    this.details = details;
    this.guidance = guidance;
  }
}

function formatNativeHostCommandError(
  message: string,
  code?: string,
  details?: Record<string, unknown>,
  guidance?: Record<string, unknown>
): string {
  const parts = [code ? `[${code}] ${message}` : message];
  if (details && Object.keys(details).length > 0) {
    parts.push(`details: ${JSON.stringify(details)}`);
  }
  if (guidance && Object.keys(guidance).length > 0) {
    parts.push(`guidance: ${JSON.stringify(guidance)}`);
  }
  return parts.join("\n");
}
