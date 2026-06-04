import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { createScaffoldRuntime } from "../../src/index.js";
import { createClaudeAdapter } from "../../src/adapters/claude-code/index.js";
import { createClaudeMcpServer } from "../../src/adapters/claude-code/mcp-server.js";

test("claude code adapter drives shared capabilities and writes host-scoped trace evidence", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "computer-use-claude-adapter-"));
  const traceDir = path.join(sandboxDir, "trace-output");
  const scaffold = createScaffoldRuntime();
  const adapter = createClaudeAdapter(scaffold.runtime, scaffold.dispatcher, scaffold.capabilities);
  const turnMeta = {
    host: "claude-code" as const,
    claudeTurnMetadata: {
      session_id: "session-claude",
      turn_id: "turn-one"
    },
    computerUseTrace: {
      enabled: true,
      outputDir: traceDir
    }
  };

  try {
    await adapter.bootstrap();
    assert.equal(adapter.capabilities.some((item) => item.name === "list_windows"), true);
    assert.equal(adapter.capabilities.some((item) => item.name === "end_turn"), true);

    const windows = await adapter.invoke("list_windows", {}, { meta: turnMeta }) as Array<{
      id: number;
      app: string;
      title?: string;
    }>;
    assert.equal(windows.length, 1);

    const window = windows[0]!;
    const windowState = await adapter.invoke(
      "get_window_state",
      { window },
      { meta: turnMeta }
    ) as {
      window: { id: number; app: string; title?: string };
      capture: { screenshotRequested: boolean; textRequested: boolean };
    };
    assert.equal(windowState.window.id, 101);
    assert.equal(windowState.capture.screenshotRequested, true);

    assert.deepEqual(
      await adapter.invoke("click", { window, x: 80, y: 140 }, { meta: turnMeta }),
      null
    );
    assert.deepEqual(
      await adapter.invoke("type_text", { window, text: "hello from claude" }, { meta: turnMeta }),
      null
    );
    await adapter.endTurn(turnMeta);

    assert.equal(await countActionDirs(traceDir, "session-claude", "turn-one"), 4);
    const evidence = await readAllEvidence(traceDir, "session-claude", "turn-one");
    assert.deepEqual(
      evidence.map((item) => item.actionType),
      ["click", "get_window_state", "list_windows", "type_text"].sort()
    );
    assert.equal(evidence.every((item) => item.hostSource === "claude-code"), true);
  } finally {
    await adapter.close();
    await rm(sandboxDir, { recursive: true, force: true });
  }
});

test("claude code MCP server lists and calls computer-use tools over stdio", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const instance = createClaudeMcpServer({
    useMockBridge: true,
    input,
    output
  }).start();

  try {
    const responses = collectOutputLines(output, 5);
    input.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        clientInfo: {
          name: "test-claude-code",
          version: "0.0.0"
        }
      }
    })}\n`);
    input.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    })}\n`);
    input.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    })}\n`);
    input.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "list_windows",
        arguments: {
          claudeTurnMetadata: {
            session_id: "mcp-session",
            turn_id: "mcp-turn"
          }
        }
      }
    })}\n`);
    input.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "get_window_state",
        arguments: {
          window: {
            id: 101,
            app: "demo.exe",
            title: "Demo Window"
          },
          claudeTurnMetadata: {
            session_id: "mcp-session",
            turn_id: "mcp-turn"
          }
        }
      }
    })}\n`);
    input.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "end_turn",
        arguments: {
          claudeTurnMetadata: {
            session_id: "mcp-session",
            turn_id: "mcp-turn"
          }
        }
      }
    })}\n`);

    const [initializeLine, toolsLine, listWindowsLine, windowStateLine, endTurnLine] = await responses;
    const initialize = JSON.parse(initializeLine!);
    assert.equal(initialize.result.serverInfo.name, "computer-use");
    assert.equal(initialize.result.capabilities.tools.listChanged, false);

    const tools = JSON.parse(toolsLine!);
    assert.equal(tools.result.tools.some((tool: { name: string }) => tool.name === "list_windows"), true);
    assert.equal(tools.result.tools.some((tool: { name: string }) => tool.name === "end_turn"), true);
    const listWindowsTool = tools.result.tools.find((tool: { name: string }) => tool.name === "list_windows");
    assert.equal(listWindowsTool.outputSchema.type, "object");
    assert.deepEqual(listWindowsTool.outputSchema.required, ["windows"]);
    const clickTool = tools.result.tools.find((tool: { name: string }) => tool.name === "click");
    assert.equal(clickTool.inputSchema.required.includes("window"), true);
    assert.equal(clickTool.inputSchema.properties.window.required.includes("id"), true);
    assert.equal(clickTool.inputSchema.properties.window.required.includes("app"), true);
    assert.equal(clickTool.inputSchema.properties.claudeTurnMetadata.required.includes("session_id"), true);
    assert.equal(clickTool.inputSchema.additionalProperties, false);

    const listWindows = JSON.parse(listWindowsLine!);
    assert.deepEqual(JSON.parse(listWindows.result.content[0].text), [
      { id: 101, app: "demo.exe", title: "Demo Window" }
    ]);
    assert.deepEqual(listWindows.result.structuredContent, {
      windows: [{ id: 101, app: "demo.exe", title: "Demo Window" }]
    });

    const windowState = JSON.parse(windowStateLine!);
    assert.equal(windowState.result.content[0].type, "image");
    assert.equal(windowState.result.content[0].mimeType, "image/jpeg");
    assert.equal(typeof windowState.result.content[0].data, "string");
    assert.equal(windowState.result.content[1].type, "text");
    const textPayload = JSON.parse(windowState.result.content[1].text);
    assert.equal(textPayload.screenshot.data, "<base64:9 bytes>");
    assert.equal(windowState.result.structuredContent.screenshot.data, "<base64:9 bytes>");
    assert.equal(windowState.result.structuredContent.screenshot.source, "mock");

    const endTurn = JSON.parse(endTurnLine!);
    assert.deepEqual(JSON.parse(endTurn.result.content[0].text), null);
  } finally {
    await instance.server.close();
  }
});

async function countActionDirs(traceDir: string, sessionId: string, turnId: string): Promise<number> {
  const turnDir = path.join(traceDir, sessionId, turnId);
  const entries = await readdir(turnDir);
  return entries.length;
}

async function readAllEvidence(traceDir: string, sessionId: string, turnId: string): Promise<any[]> {
  const turnDir = path.join(traceDir, sessionId, turnId);
  const actionDirs = (await readdir(turnDir)).sort();
  const evidence = await Promise.all(
    actionDirs.map(async (actionDir) => JSON.parse(
      await readFile(path.join(turnDir, actionDir, "evidence.json"), "utf8")
    ))
  );
  return evidence.sort((left, right) => String(left.actionType).localeCompare(String(right.actionType)));
}

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
