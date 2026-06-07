import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScaffoldRuntime } from "../../src/index.js";
import { createCodexAdapter } from "../../src/adapters/codex/index.js";
import { CodexHelperTransport } from "../../src/adapters/codex/helper-transport.js";
import { CodexAdapterRpcError } from "../../src/adapters/codex/plugin-contract.js";

test("codex adapter drives the helper end-to-end and writes trace artifacts by session and turn", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "computer-use-codex-adapter-"));
  const traceDir = path.join(sandboxDir, "trace-output");
  const scaffold = createScaffoldRuntime();
  const adapter = createCodexAdapter(scaffold.runtime, scaffold.dispatcher, scaffold.capabilities, {
    transport: new CodexHelperTransport({
      cwd: resolveProjectRoot(),
      env: {
        ...process.env,
        COMPUTER_USE_TEST_USE_MOCK_BRIDGE: "1"
      }
    })
  });

  const turnOneMeta = {
    host: "codex" as const,
    codexTurnMetadata: {
      session_id: "session-codex",
      turn_id: "turn-one"
    },
    computerUseTrace: {
      enabled: true,
      outputDir: traceDir
    }
  };
  const turnTwoMeta = {
    host: "codex" as const,
    codexTurnMetadata: {
      session_id: "session-codex",
      turn_id: "turn-two"
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

    const windows = await adapter.invoke("list_windows", {}, { meta: turnOneMeta }) as Array<{
      id: number;
      app: string;
      title?: string;
    }>;
    assert.equal(windows.length, 1);

    const window = windows[0]!;
    const windowState = await adapter.invoke(
      "get_window_state",
      { window },
      { meta: turnOneMeta }
    ) as {
      window: { id: number; app: string; title?: string };
      capture: { screenshotRequested: boolean; textRequested: boolean };
    };
    assert.equal(windowState.window.id, 101);
    assert.equal(windowState.capture.screenshotRequested, true);

    const clickResult = await adapter.invoke("click", { window, x: 80, y: 140 }, { meta: turnOneMeta }) as {
      ok: boolean;
      screenPoint: { x: number; y: number };
    };
    assert.equal(clickResult.ok, true);
    assert.deepEqual(clickResult.screenPoint, { x: 80, y: 140 });
    assert.deepEqual(
      await adapter.invoke("press_key", { window, key: "Return" }, { meta: turnOneMeta }),
      null
    );
    assert.deepEqual(
      await adapter.invoke("type_text", { window, text: "hello from codex" }, { meta: turnOneMeta }),
      null
    );
    await adapter.endTurn(turnOneMeta);

    const apps = await adapter.invoke("list_apps", {}, { meta: turnTwoMeta }) as {
      apps: Array<{ id: string; displayName?: string }>;
    };
    assert.equal(apps.apps[0]?.id, "demo.exe");

    const launchResult = await adapter.invoke("launch_app", { app: "demo.exe", launch_mode: "force_new" }, { meta: turnTwoMeta }) as any;
    assert.equal(launchResult.ok, true);
    assert.equal(launchResult.app, "demo.exe");
    assert.equal(launchResult.strategy, "executable_path");
    assert.equal(launchResult.launchMode, "force_new");
    assert.equal(launchResult.disposition, "observed_window");
    assert.deepEqual(launchResult.observedWindows, [
      { id: 101, app: "demo.exe", title: "Demo Window" }
    ]);
    assert.deepEqual(
      await adapter.invoke(
        "click_element",
        { window, element_index: 1 },
        { meta: turnTwoMeta }
      ),
      null
    );
    assert.deepEqual(
      await adapter.invoke(
        "set_value",
        { window, element_index: 1, value: "codex-updated" },
        { meta: turnTwoMeta }
      ),
      null
    );
    await adapter.endTurn(turnTwoMeta);
    await adapter.close();

    assert.equal(await countActionDirs(traceDir, "session-codex", "turn-one"), 5);
    assert.equal(await countActionDirs(traceDir, "session-codex", "turn-two"), 4);

    const turnOneEvidence = await readAllEvidence(traceDir, "session-codex", "turn-one");
    assert.deepEqual(
      turnOneEvidence.map((item) => item.actionType),
      ["click", "get_window_state", "list_windows", "press_key", "type_text"].sort()
    );
    assert.equal(turnOneEvidence.every((item) => item.hostSource === "codex"), true);

    const turnTwoEvidence = await readAllEvidence(traceDir, "session-codex", "turn-two");
    assert.deepEqual(
      turnTwoEvidence.map((item) => item.actionType),
      ["click_element", "launch_app", "list_apps", "set_value"].sort()
    );
  } finally {
    await adapter.close();
    await rm(sandboxDir, { recursive: true, force: true });
  }
});

test("codex adapter propagates approvalRequest errors from the helper transport", async () => {
  const fixturePath = fileURLToPath(new URL("../fixtures/codex-approval-helper.mjs", import.meta.url));
  const scaffold = createScaffoldRuntime();
  const adapter = createCodexAdapter(scaffold.runtime, scaffold.dispatcher, scaffold.capabilities, {
    transport: new CodexHelperTransport({
      command: process.execPath,
      args: [fixturePath]
    })
  });

  try {
    await adapter.bootstrap();
    await assert.rejects(
      adapter.invoke(
        "launch_app",
        { app: "admin.exe" },
        {
          meta: {
            host: "codex",
            codexTurnMetadata: {
              session_id: "session-approval",
              turn_id: "turn-approval"
            }
          }
        }
      ),
      (error: unknown) => {
        assert.equal(error instanceof CodexAdapterRpcError, true);
        const rpcError = error as CodexAdapterRpcError;
        assert.equal(rpcError.code, "approval_required");
        assert.deepEqual(rpcError.approvalRequest, {
          app: "admin.exe",
          displayName: "Admin Tool",
          riskLevel: "high"
        });
        return true;
      }
    );
  } finally {
    await adapter.close();
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

function resolveProjectRoot(): string {
  return fileURLToPath(new URL("../../", import.meta.url));
}
