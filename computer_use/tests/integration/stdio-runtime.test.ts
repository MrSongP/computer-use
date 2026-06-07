import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { createScaffoldRuntime } from "../../src/index.js";
import { StdioJsonRpcServer, StdioRpcRuntime } from "../../src/core/transport/stdio-server.js";
import type { MockNativeBridge } from "../../src/mocks/native-bridge.mock.js";
import { ESCAPE_ERROR_MESSAGE } from "../../src/core/interrupt/interrupt-error.js";

test("stdio runtime handles click and end_turn requests over line-delimited JSON-RPC", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const scaffold = createScaffoldRuntime();
  const transport = new StdioJsonRpcServer({ input, output });
  const runtime = new StdioRpcRuntime(transport, scaffold.dispatcher, scaffold.runtime);
  runtime.start();

  const responses = collectOutputLines(output, 2);
  input.write(
    `${JSON.stringify({
      id: 1,
      method: "click",
      params: { window: { id: 101, app: "demo.exe" }, x: 10, y: 20 }
    })}\n`
  );
  input.write(`${JSON.stringify({ id: 2, method: "end_turn", params: {} })}\n`);

  const [clickLine, endTurnLine] = await responses;
  const clickResponse = JSON.parse(clickLine!);
  assert.equal(clickResponse.id, 1);
  assert.equal(clickResponse.ok, true);
  assert.equal(clickResponse.result.ok, true);
  assert.deepEqual(clickResponse.result.screenPoint, { x: 10, y: 20 });
  assert.deepEqual(JSON.parse(endTurnLine!), { id: 2, ok: true, result: null });

  const bridge = scaffold.runtime.nativeBridge as MockNativeBridge;
  assert.deepEqual(
    bridge.getRecordedInvocations().map((entry) => entry.name),
    ["beginTurn", "activateWindow", "getVirtualScreenMetrics", "sendPointerClick", "endTurn"]
  );
});

test("stdio runtime handles discovery requests over line-delimited JSON-RPC", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const scaffold = createScaffoldRuntime();
  const transport = new StdioJsonRpcServer({ input, output });
  const runtime = new StdioRpcRuntime(transport, scaffold.dispatcher, scaffold.runtime);
  runtime.start();

  const responses = collectOutputLines(output, 2);
  input.write(`${JSON.stringify({ id: 9, method: "list_windows", params: {} })}\n`);
  input.write(`${JSON.stringify({ id: 10, method: "list_apps", params: {} })}\n`);

  const [listWindowsLine, listAppsLine] = await responses;
  assert.deepEqual(JSON.parse(listWindowsLine!), {
    id: 9,
    ok: true,
    result: [{ id: 101, app: "demo.exe", title: "Demo Window" }]
  });
  const listApps = JSON.parse(listAppsLine!);
  assert.equal(listApps.id, 10);
  assert.equal(listApps.ok, true);
  assert.deepEqual(listApps.result.apps, [
    {
      id: "demo.exe",
      displayName: "Demo App",
      executablePath: "C:\\Demo\\demo.exe",
      isRunning: true,
      activationModel: "executable_path",
      windows: [{ id: 101, app: "demo.exe", title: "Demo Window" }]
    },
    {
      id: "windows.shell.taskbar",
      displayName: "Windows Taskbar",
      isRunning: true,
      activationModel: "executable_path",
      windows: [{ id: 501, app: "windows.shell.taskbar", title: "Windows Taskbar" }]
    }
  ]);
  assert.equal(listApps.result.runtime.schemaVersion, "computer-use/list-apps/v1");
  assert.equal(listApps.result.runtime.driverName, "mock");
});

test("stdio runtime closes the transport and exit path on close", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const scaffold = createScaffoldRuntime();
  const transport = new StdioJsonRpcServer({ input, output });
  let exitCode: number | undefined;
  const runtime = new StdioRpcRuntime(transport, scaffold.dispatcher, scaffold.runtime, {
    exit(code) {
      exitCode = code;
    }
  });
  runtime.start();

  const responses = collectOutputLines(output, 1);
  input.write(`${JSON.stringify({ id: 3, method: "close", params: {} })}\n`);

  const [closeLine] = await responses;
  assert.deepEqual(JSON.parse(closeLine!), { id: 3, ok: true, result: null });
  assert.equal(exitCode, 0);
});

test("stdio runtime returns the canonical Escape interrupt error for interrupted turn scope", async () => {
  const codexHome = await mkdtemp(path.join(tmpdir(), "computer-use-stdio-"));
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;

  try {
    const input = new PassThrough();
    const output = new PassThrough();
    const scaffold = createScaffoldRuntime();
    const transport = new StdioJsonRpcServer({ input, output });
    const runtime = new StdioRpcRuntime(transport, scaffold.dispatcher, scaffold.runtime);
    runtime.start();

    const meta = {
      codexTurnMetadata: {
        session_id: "session-interrupt",
        turn_id: "turn-interrupt"
      }
    };
    await runtime.triggerPhysicalEscape(meta);

    const responses = collectOutputLines(output, 1);
    input.write(
      `${JSON.stringify({
        id: 4,
        method: "click",
        params: { window: { id: 101, app: "demo.exe" }, x: 10, y: 20 },
        meta
      })}\n`
    );

    const [interruptLine] = await responses;
    assert.deepEqual(JSON.parse(interruptLine!), {
      id: 4,
      ok: false,
      code: "interrupted",
      error: ESCAPE_ERROR_MESSAGE
    });
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("stdio runtime force-cleans the active turn when physical Escape interrupts it", async () => {
  const codexHome = await mkdtemp(path.join(tmpdir(), "computer-use-stdio-cleanup-"));
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;

  try {
    const input = new PassThrough();
    const output = new PassThrough();
    const scaffold = createScaffoldRuntime();
    const transport = new StdioJsonRpcServer({ input, output });
    const runtime = new StdioRpcRuntime(transport, scaffold.dispatcher, scaffold.runtime);
    runtime.start();

    const meta = {
      codexTurnMetadata: {
        session_id: "session-cleanup",
        turn_id: "turn-cleanup"
      }
    };

    const firstResponse = collectOutputLines(output, 1);
    input.write(`${JSON.stringify({ id: 11, method: "list_windows", params: {}, meta })}\n`);
    await firstResponse;

    await runtime.triggerPhysicalEscape(meta);

    const interruptResponse = collectOutputLines(output, 1);
    input.write(
      `${JSON.stringify({
        id: 12,
        method: "click",
        params: { window: { id: 101, app: "demo.exe" }, x: 10, y: 20 },
        meta
      })}\n`
    );

    const [interruptLine] = await interruptResponse;
    assert.deepEqual(JSON.parse(interruptLine!), {
      id: 12,
      ok: false,
      code: "interrupted",
      error: ESCAPE_ERROR_MESSAGE
    });

    const bridge = scaffold.runtime.nativeBridge as MockNativeBridge;
    assert.deepEqual(
      bridge.getRecordedInvocations().map((entry) => entry.name),
      ["beginTurn", "listWindows", "resetTurn"]
    );
    assert.equal(bridge.getRecordedInvocations()[2]?.payload, "interrupted");
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
    await rm(codexHome, { recursive: true, force: true });
  }
});

test("stdio runtime resets an unfinished turn before starting a different turn", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const scaffold = createScaffoldRuntime();
  const transport = new StdioJsonRpcServer({ input, output });
  const runtime = new StdioRpcRuntime(transport, scaffold.dispatcher, scaffold.runtime);
  runtime.start();

  const responses = collectOutputLines(output, 2);
  input.write(
    `${JSON.stringify({
      id: 21,
      method: "list_windows",
      params: {},
      meta: { codexTurnMetadata: { session_id: "session-stale", turn_id: "turn-one" } }
    })}\n`
  );
  input.write(
    `${JSON.stringify({
      id: 22,
      method: "list_apps",
      params: {},
      meta: { codexTurnMetadata: { session_id: "session-stale", turn_id: "turn-two" } }
    })}\n`
  );

  await responses;

  const bridge = scaffold.runtime.nativeBridge as MockNativeBridge;
  assert.deepEqual(
    bridge.getRecordedInvocations().map((entry) => entry.name),
    ["beginTurn", "listWindows", "resetTurn", "beginTurn", "listApps"]
  );
  assert.equal(bridge.getRecordedInvocations()[2]?.payload, "stale_turn");
});

async function collectOutputLines(stream: PassThrough, expectedCount: number): Promise<string[]> {
  const lines: string[] = [];
  let buffer = "";

  return await new Promise<string[]>((resolve, reject) => {
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) {
          break;
        }

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          lines.push(line);
        }

        if (lines.length === expectedCount) {
          cleanup();
          resolve(lines);
          return;
        }
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      stream.off("data", onData);
      stream.off("error", onError);
    };

    stream.on("data", onData);
    stream.on("error", onError);
  });
}
