import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { access } from "node:fs/promises";
import path from "node:path";
import { createWindowsRuntime } from "../../src/index.js";

test("list_apps reports hidden process-only executables as running", async (t) => {
  if (process.platform !== "win32") {
    t.skip("Windows-only list_apps background process coverage");
    return;
  }

  const probeExePath = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "ping.exe");
  try {
    await access(probeExePath);
  } catch {
    t.skip("ping.exe not available for process-only list_apps coverage");
    return;
  }

  const child = spawn(probeExePath, ["-t", "127.0.0.1"], {
    windowsHide: true,
    stdio: "ignore"
  });

  assert.equal(typeof child.pid, "number");
  await sleep(300);

  const scaffold = createWindowsRuntime();
  try {
    const response = await scaffold.dispatcher.dispatch({
      id: 101,
      method: "list_apps",
      params: {
        id_contains: "ping.exe",
        limit: 10
      },
      meta: {
        host: "codex",
        codexTurnMetadata: {
          session_id: "list-apps-background-process",
          turn_id: "list-apps-background-process-turn"
        }
      }
    });

    assert.equal(response.ok, true);
    const result = response.ok ? response.result as any : null;
    const target = result.apps.find((app: any) =>
      samePath(app.executablePath, probeExePath) &&
      Array.isArray(app.processIds) &&
      app.processIds.includes(child.pid)
    );

    assert.equal(Boolean(target), true);
    assert.equal(target.isRunning, true);
    assert.equal(target.activationModel, "executable_path");
    assert.deepEqual(target.windows, []);
  } finally {
    await scaffold.runtime.endTurn.close();
    await stopProcess(child);
  }
});

function samePath(left: string | undefined, right: string): boolean {
  return (left ?? "").toLowerCase() === right.toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill();
  await Promise.race([
    once(child, "exit"),
    sleep(2_000)
  ]);
}
