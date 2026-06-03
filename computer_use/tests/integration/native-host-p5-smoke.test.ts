import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FRAMEWORK64_CSC_PATH = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
const FRAMEWORK32_CSC_PATH = "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe";
const FRAMEWORK64_DIR = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319";
const FRAMEWORK64_WPF_PATH = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\WPF";
const WINDOWS_WINMD_PATH = "C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata\\10.0.26100.0\\Windows.winmd";
const nativeHostSourcePath = path.resolve("native-host/ComputerUse.NativeHost/Program.cs");
const nativeHostExePath = path.resolve("native-host/ComputerUse.NativeHost/bin/Release/ComputerUse.NativeHost.exe");
const smokeAppSourcePath = path.resolve("tests/fixtures/ComputerUse.P5SmokeApp.cs");

test("native host closes the P5 exit with real WGC and UIA smoke coverage", async (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows-only native-host smoke test");
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
    await ensureNativeHostExecutable(cscPath);
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
    const client = new NativeHostClient(nativeHostExePath);

    try {
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
          include_screenshot: true,
          include_text: true,
          max_elements: 128
        }
      })).result;

      assert.equal(initialState.capture.screenshotSource, "wgc");
      assert.equal(initialState.screenshot.mime, "image/jpeg");
      assert.equal(initialState.screenshot.raw.mime, "image/png");

      const initialNodes = flattenNodes(initialState.text);
      const inputNode = requireNode(
        initialNodes,
        (node) => node.name === "Input Value" && node.patterns?.includes("ValuePattern"),
        "ValuePattern input node"
      );
      const buttonNode = requireNode(
        initialNodes,
        (node) => node.name === "Apply" && node.patterns?.includes("InvokePattern"),
        "InvokePattern button node"
      );
      const comboNode = requireNode(
        initialNodes,
        (node) => node.name === "Mode Picker" && node.secondaryActions?.includes("expand"),
        "expand-capable combo node"
      );

      await client.request("setValue", {
        params: {
          window,
          element_index: inputNode.index,
          value: "hello native host"
        }
      });
      await sleep(250);

      const afterSetValueState = (await client.request("getWindowState", {
        params: {
          window,
          include_screenshot: false,
          include_text: true,
          max_elements: 128
        }
      })).result;
      const afterSetValueNodes = flattenNodes(afterSetValueState.text);
      assert.ok(
        afterSetValueNodes.some((node) => node.name === "Typed:hello native host"),
        "status label should reflect the ValuePattern update"
      );

      await client.request("clickElement", {
        params: {
          window,
          element_index: buttonNode.index
        }
      });
      await sleep(250);

      const afterClickState = (await client.request("getWindowState", {
        params: {
          window,
          include_screenshot: false,
          include_text: true,
          max_elements: 128
        }
      })).result;
      const afterClickNodes = flattenNodes(afterClickState.text);
      assert.ok(
        afterClickNodes.some((node) => node.name === "Clicked:hello native host"),
        "click_element should invoke the button and update the UI"
      );

      await client.request("performSecondaryAction", {
        params: {
          window,
          element_index: comboNode.index,
          action: "expand"
        }
      });
      await sleep(250);

      const afterExpandState = (await client.request("getWindowState", {
        params: {
          window,
          include_screenshot: false,
          include_text: true,
          max_elements: 128
        }
      })).result;
      const afterExpandNodes = flattenNodes(afterExpandState.text);
      assert.ok(
        afterExpandNodes.some((node) => node.name === "Expanded"),
        "perform_secondary_action should expand the combo box and update the UI"
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

  constructor(executablePath: string) {
    this.child = spawn(executablePath, [], {
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

    pending.reject(new Error(payload.error ?? "native host request failed"));
  }
}

async function ensureNativeHostExecutable(cscPath: string): Promise<void> {
  const nativeHostSourceStat = await stat(nativeHostSourcePath);

  try {
    const nativeHostExeStat = await stat(nativeHostExePath);
    if (nativeHostExeStat.mtimeMs >= nativeHostSourceStat.mtimeMs) {
      return;
    }
  } catch {
    // compile below
  }

  await execFileAsync(
    cscPath,
    [
      "/nologo",
      "/target:exe",
      `/out:${nativeHostExePath}`,
      "/r:System.Web.Extensions.dll",
      "/r:System.Drawing.dll",
      `/r:${path.join(FRAMEWORK64_DIR, "System.Runtime.dll")}`,
      `/r:${path.join(FRAMEWORK64_DIR, "System.Runtime.InteropServices.WindowsRuntime.dll")}`,
      `/r:${path.join(FRAMEWORK64_DIR, "System.Runtime.WindowsRuntime.dll")}`,
      `/r:${path.join(FRAMEWORK64_WPF_PATH, "UIAutomationClient.dll")}`,
      `/r:${path.join(FRAMEWORK64_WPF_PATH, "UIAutomationTypes.dll")}`,
      `/r:${path.join(FRAMEWORK64_WPF_PATH, "WindowsBase.dll")}`,
      `/r:${WINDOWS_WINMD_PATH}`,
      nativeHostSourcePath
    ],
    {
      cwd: path.dirname(nativeHostSourcePath),
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

function requireNode(nodes: any[], predicate: (node: any) => boolean, description: string): any {
  const match = nodes.find(predicate);
  assert.ok(match, `missing ${description}`);
  return match;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
