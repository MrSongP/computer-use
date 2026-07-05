import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const NATIVE_HOST_TARGET_FRAMEWORK = "net8.0-windows10.0.19041.0";
const DEFAULT_WINDOWS_DOTNET_PATHS = [
  "C:\\Program Files\\dotnet\\dotnet.exe",
  "C:\\Program Files (x86)\\dotnet\\dotnet.exe"
] as const;
const FRAMEWORK64_CSC_PATH = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
const FRAMEWORK32_CSC_PATH = "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe";
const nativeHostProjectPath = path.resolve("native-host/ComputerUse.NativeHost/ComputerUse.NativeHost.csproj");
const nativeHostAssemblyPath = path.resolve(
  "native-host/ComputerUse.NativeHost/bin/Release",
  NATIVE_HOST_TARGET_FRAMEWORK,
  "ComputerUse.NativeHost.dll"
);
const smokeAppSourcePath = path.resolve("tests/fixtures/ComputerUse.P5SmokeApp.cs");

test("native host exercises every non-dialog action against the real smoke app", async (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows-only native-host smoke test");
    return;
  }

  const dotnetPath = await resolveDotnetExecutable();
  if (!dotnetPath) {
    t.skip("dotnet SDK not available");
    return;
  }

  const cscPath = await resolveCscExecutable();
  if (!cscPath) {
    t.skip("csc.exe not available");
    return;
  }

  const sandboxDir = await mkdtemp(path.join(tmpdir(), "computer-use-p5-smoke-"));
  const smokeAppExePath = path.join(sandboxDir, "ComputerUse.P5SmokeApp.exe");
  const smokeInfoPath = path.join(sandboxDir, "smoke-app.info");
  let smokeAppProcess: ChildProcessWithoutNullStreams | undefined;

  try {
    await buildNativeHost(dotnetPath);
    await compileSmokeApp(cscPath, smokeAppExePath);

    smokeAppProcess = spawn(smokeAppExePath, [], {
      windowsHide: false,
      stdio: "ignore",
      env: {
        ...process.env,
        COMPUTER_USE_SMOKE_INFO_PATH: smokeInfoPath
      }
    }) as ChildProcessWithoutNullStreams;

    const smokeInfo = await waitForSmokeInfo(smokeInfoPath);
    const client = new NativeHostClient(dotnetPath, [nativeHostAssemblyPath]);

    try {
      const verifiedActions = new Set<string>();
      await client.request("beginTurn", {
        meta: {
          host: "codex",
          codexTurnMetadata: {
            session_id: "native-host-p5-smoke",
            turn_id: "native-host-p5-smoke-turn"
          }
        }
      });

      const window = {
        id: smokeInfo.windowId,
        app: smokeAppExePath,
        title: smokeInfo.title
      };

      const initialState = (await client.request("getWindowState", {
        params: {
          window,
          include_screenshot: false,
          include_text: true,
          max_elements: 128
        }
      })).result;

      await t.test("captures the fixture through real WGC when the desktop session allows it", async (captureTest) => {
        let screenshotState: any;
        try {
          screenshotState = (await client.request("getWindowState", {
            params: {
              window,
              include_screenshot: true,
              include_text: false
            }
          })).result;
        } catch (error) {
          if (isSandboxedDesktopCaptureError(error)) {
            captureTest.skip(
              "WGC capture and GDI fallback are unavailable in this sandboxed/restricted desktop session"
            );
            return;
          }
          throw error;
        }

        if (screenshotState.capture.screenshotSource !== "wgc") {
          captureTest.skip(
            `WGC is unavailable in this desktop session; capture used ${screenshotState.capture.screenshotSource}`
          );
          return;
        }

        assert.equal(screenshotState.screenshot.mime, "image/jpeg");
        assert.equal(screenshotState.screenshot.raw.mime, "image/png");
      });

      const initialNodes = flattenNodes(initialState.text);
      requireNode(initialNodes, (node) => node.name === "Input Value", "ValuePattern input node");
      requireNode(initialNodes, (node) => node.name === "Apply", "InvokePattern button node");
      requireNode(initialNodes, (node) => node.name === "Mode Picker", "expand-capable combo node");
      requireNode(initialNodes, (node) => node.name === "Pointer Target", "pointer target");
      requireNode(initialNodes, (node) => node.name === "Keyboard Input", "keyboard input");
      requireNode(initialNodes, (node) => node.name === "Scroll Surface", "scroll surface");
      requireNode(initialNodes, (node) => node.name === "Drag Surface", "drag surface");

      const activation = (await client.request("activateWindow", { window })).result;
      assert.equal(activation.ok, true);
      assert.equal(activation.focused, true);
      verifiedActions.add("activate_window");

      const filteredState = (await client.request("getWindowState", {
        params: {
          window,
          include_screenshot: false,
          include_text: true,
          max_elements: 2,
          role_filter: ["Button"],
          name_contains: "Apply"
        }
      })).result;
      const filteredNodes = flattenNodes(filteredState.text);
      const filteredButton = requireNode(
        filteredNodes,
        (node) => node.name === "Apply" && node.role === "Button",
        "filtered Apply button"
      );
      assert.equal(filteredState.capture.elementsReturned, 2);
      assert.equal(filteredState.capture.elementsMatched, 1);
      assert.equal(filteredState.capture.truncated, false);
      assert.equal(filteredState.capture.partial, false);
      assert.ok(filteredState.capture.elementsTotal >= filteredState.capture.elementsReturned);
      assert.equal(filteredState.capture.lastReturnedIndex, filteredButton.index);

      let actionState = await getTextState(client, window);
      let actionNodes = flattenNodes(actionState.text);
      const inputNode = requireNode(
        actionNodes,
        (node) => node.name === "Input Value" && node.patterns?.includes("ValuePattern"),
        "fresh ValuePattern input node"
      );
      await client.request("setValue", {
        params: {
          window,
          element_index: inputNode.index,
          value: "hello native host"
        }
      });
      actionState = await expectStatus(client, window, "Typed:hello native host");
      actionNodes = flattenNodes(actionState.text);
      verifiedActions.add("set_value");

      const buttonNode = requireNode(
        actionNodes,
        (node) => node.name === "Apply" && node.patterns?.includes("InvokePattern"),
        "fresh InvokePattern button node"
      );
      await client.request("clickElement", {
        params: {
          window,
          element_index: buttonNode.index
        }
      });
      actionState = await expectStatus(client, window, "Clicked:hello native host");
      actionNodes = flattenNodes(actionState.text);
      verifiedActions.add("click_element");

      let comboNode = requireNode(
        actionNodes,
        (node) => node.name === "Mode Picker" && node.secondaryActions?.includes("expand"),
        "fresh expand-capable combo node"
      );
      await client.request("performSecondaryAction", {
        params: {
          window,
          element_index: comboNode.index,
          action: "expand"
        }
      });
      actionState = await expectStatus(client, window, "Expanded");
      actionNodes = flattenNodes(actionState.text);
      verifiedActions.add("perform_secondary_action");
      comboNode = requireNode(
        actionNodes,
        (node) => node.name === "Mode Picker" && node.secondaryActions?.includes("collapse"),
        "fresh collapse-capable combo node"
      );
      await client.request("performSecondaryAction", {
        params: {
          window,
          element_index: comboNode.index,
          action: "collapse"
        }
      });
      actionState = await expectStatus(client, window, "Collapsed");
      actionNodes = flattenNodes(actionState.text);

      const pointerNode = requireNode(
        actionNodes,
        (node) => node.name === "Pointer Target",
        "pointer target with bounds"
      );
      const pointerPoint = centerOfNode(pointerNode);
      const pointerFeedback = (await client.request("sendPointerClick", {
        click: {
          x: pointerPoint.x,
          y: pointerPoint.y,
          button: "left",
          clickCount: 1
        },
        targetWindow: window
      })).result;
      assert.equal(pointerFeedback.hitTest.matchesTarget, true);
      await expectStatus(client, window, "PointerClicked");
      verifiedActions.add("click");

      actionState = await getTextState(client, window);
      actionNodes = flattenNodes(actionState.text);
      const keyboardNode = requireNode(
        actionNodes,
        (node) => node.name === "Keyboard Input",
        "keyboard input with bounds"
      );
      const keyboardPoint = centerOfNode(keyboardNode);
      await client.request("sendPointerClick", {
        click: {
          x: keyboardPoint.x,
          y: keyboardPoint.y,
          button: "left",
          clickCount: 1
        },
        targetWindow: window
      });
      await client.request("sendText", { text: "typed by native host" });
      await expectStatus(client, window, "Typed:typed by native host");
      verifiedActions.add("type_text");

      await client.request("sendKeyboardInputs", {
        inputs: [
          { key: "Return", vkCode: 13, scanCode: 0, flags: 0 },
          { key: "Return", vkCode: 13, scanCode: 0, flags: 2 }
        ]
      });
      await expectStatus(client, window, "Key:Enter");
      verifiedActions.add("press_key");

      actionState = await getTextState(client, window);
      actionNodes = flattenNodes(actionState.text);
      const scrollPoint = centerOfNode(requireNode(
        actionNodes,
        (node) => node.name === "Scroll Surface",
        "scroll surface with bounds"
      ));
      await client.request("sendPointerScroll", {
        scroll: {
          x: scrollPoint.x,
          y: scrollPoint.y,
          scrollX: 0,
          scrollY: 120
        }
      });
      await expectStatus(client, window, "Scrolled");
      verifiedActions.add("scroll");

      actionState = await getTextState(client, window);
      actionNodes = flattenNodes(actionState.text);
      const dragBounds = requireBounds(requireNode(
        actionNodes,
        (node) => node.name === "Drag Surface",
        "drag surface with bounds"
      ));
      await client.request("sendPointerDrag", {
        drag: {
          fromX: Math.round(dragBounds.left + 30),
          fromY: Math.round((dragBounds.top + dragBounds.bottom) / 2),
          toX: Math.round(dragBounds.right - 30),
          toY: Math.round((dragBounds.top + dragBounds.bottom) / 2),
          button: "left",
          durationMs: 300,
          steps: 12
        }
      });
      await expectStatus(client, window, "Dragged");
      verifiedActions.add("drag");

      assert.deepEqual(
        [...verifiedActions].sort(),
        [
          "activate_window",
          "click",
          "click_element",
          "drag",
          "perform_secondary_action",
          "press_key",
          "scroll",
          "set_value",
          "type_text"
        ],
        "the real smoke app must cover every non-dialog action capability"
      );

      await client.request("endTurn", {});
    } finally {
      await client.close();
    }
  } finally {
    if (smokeAppProcess && !smokeAppProcess.killed) {
      smokeAppProcess.kill("SIGKILL");
      await once(smokeAppProcess, "exit").catch(() => undefined);
    }
    await rm(sandboxDir, { recursive: true, force: true });
  }
});

class NativeHostClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly reader: readline.Interface;
  private readonly pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private requestId = 0;
  private stderr = "";

  constructor(command: string, args: readonly string[]) {
    this.child = spawn(command, [...args], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");

    this.reader = readline.createInterface({ input: this.child.stdout });
    this.reader.on("line", (line) => {
      this.handleResponse(line);
    });
    this.child.stderr.on("data", (chunk: string | Buffer) => {
      this.stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    this.child.once("exit", (code, signal) => {
      const error = new Error(
        `native host exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"})\n${this.stderr}`.trim()
      );
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    });
  }

  async request(method: string, payload: Record<string, unknown>): Promise<any> {
    const id = ++this.requestId;
    const envelope = JSON.stringify({ id, method, payload });

    return await new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${envelope}\n`, "utf8", (error) => {
        if (!error) {
          return;
        }
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  async close(): Promise<void> {
    this.child.stdin.end();
    await once(this.child, "exit");
    this.reader.close();
  }

  private handleResponse(line: string): void {
    const payload = JSON.parse(line) as {
      id: number;
      ok: boolean;
      result?: unknown;
      error?: string;
    };

    const pending = this.pending.get(payload.id);
    if (!pending) {
      return;
    }

    this.pending.delete(payload.id);
    if (payload.ok) {
      pending.resolve(payload);
      return;
    }

    pending.reject(new Error(
      `${payload.error ?? "native host request failed"}\nresponse: ${JSON.stringify(payload)}\nstderr: ${this.stderr}`
    ));
  }
}

async function buildNativeHost(dotnetPath: string): Promise<void> {
  await execFileAsync(
    dotnetPath,
    ["build", nativeHostProjectPath, "-c", "Release", "--nologo"],
    {
      cwd: path.dirname(nativeHostProjectPath),
      windowsHide: true
    }
  );
}

async function compileSmokeApp(cscPath: string, outputPath: string): Promise<void> {
  await execFileAsync(
    cscPath,
    [
      "/nologo",
      "/target:winexe",
      `/out:${outputPath}`,
      "/r:System.Windows.Forms.dll",
      "/r:System.Drawing.dll",
      smokeAppSourcePath
    ],
    {
      cwd: path.dirname(smokeAppSourcePath),
      windowsHide: true
    }
  );
}

async function resolveCscExecutable(): Promise<string | undefined> {
  for (const candidate of [FRAMEWORK64_CSC_PATH, FRAMEWORK32_CSC_PATH]) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
}

async function resolveDotnetExecutable(): Promise<string | undefined> {
  const candidates = [
    process.env.COMPUTER_USE_DOTNET_PATH,
    "dotnet",
    ...DEFAULT_WINDOWS_DOTNET_PATHS
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

  for (const candidate of candidates) {
    if (candidate.includes("\\") || path.isAbsolute(candidate)) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    try {
      await execFileAsync(process.platform === "win32" ? "where.exe" : "which", [candidate], {
        windowsHide: true
      });
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
}

async function waitForSmokeInfo(infoPath: string): Promise<{ pid: number; windowId: number; title: string }> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const content = await readFile(infoPath, "utf8");
      const [pidText, windowIdText, title] = content.trim().split(/\r?\n/);
      if (pidText && windowIdText && title) {
        return {
          pid: Number(pidText),
          windowId: Number(windowIdText),
          title
        };
      }
    } catch {
      // keep waiting
    }

    await sleep(100);
  }

  throw new Error("smoke app did not publish its window info in time");
}

function flattenNodes(root: any): any[] {
  const nodes: any[] = [root];
  for (const child of root.children ?? []) {
    nodes.push(...flattenNodes(child));
  }
  return nodes;
}

async function getTextState(client: NativeHostClient, window: Record<string, unknown>): Promise<any> {
  return (await client.request("getWindowState", {
    params: {
      window,
      include_screenshot: false,
      include_text: true,
      max_elements: 128
    }
  })).result;
}

async function expectStatus(
  client: NativeHostClient,
  window: Record<string, unknown>,
  expected: string
): Promise<any> {
  await sleep(250);
  const state = await getTextState(client, window);
  assert.ok(
    flattenNodes(state.text).some((node) => node.name === expected),
    `status label should report ${expected}`
  );
  return state;
}

function centerOfNode(node: any): { x: number; y: number } {
  const bounds = requireBounds(node);
  return {
    x: Math.round((bounds.left + bounds.right) / 2),
    y: Math.round((bounds.top + bounds.bottom) / 2)
  };
}

function requireBounds(node: any): { left: number; top: number; right: number; bottom: number } {
  const bounds = node.bounds;
  assert.ok(bounds, `node ${String(node.name)} does not expose bounds`);
  for (const field of ["left", "top", "right", "bottom"] as const) {
    assert.equal(typeof bounds[field], "number", `node ${String(node.name)} has invalid ${field} bound`);
  }
  return bounds;
}

function isSandboxedDesktopCaptureError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("[WGC-DIAG]") &&
    error.message.includes("GraphicsCaptureSession.IsSupported") &&
    error.message.includes("句柄无效");
}

function requireNode(nodes: any[], predicate: (node: any) => boolean, description: string): any {
  const match = nodes.find(predicate);
  assert.ok(match, `missing ${description}`);
  return match;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
