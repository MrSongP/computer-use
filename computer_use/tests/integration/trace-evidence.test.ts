import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createScaffoldRuntime } from "../../src/index.js";

test("trace stays off by default and does not write evidence", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "computer-use-trace-off-"));
  const traceDir = path.join(sandboxDir, "trace-output");

  try {
    const scaffold = createScaffoldRuntime({
      trace: {
        enabled: false,
        outputDir: traceDir
      }
    });

    const response = await scaffold.dispatcher.dispatch({
      id: 11,
      method: "click",
      params: {
        window: { id: 101, app: "demo.exe" },
        x: 100,
        y: 200
      }
    });

    assert.deepEqual(response, { id: 11, ok: true, result: null });
    await assert.rejects(access(traceDir));
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
});

test("request-level trace meta writes success evidence under session and turn folders", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "computer-use-trace-meta-"));
  const traceDir = path.join(sandboxDir, "trace-output");

  try {
    const scaffold = createScaffoldRuntime({
      trace: {
        enabled: false
      }
    });

    const response = await scaffold.dispatcher.dispatch({
      id: 12,
      method: "click",
      params: {
        window: { id: 101, app: "demo.exe", title: "Demo" },
        x: 144,
        y: 288,
        mouse_button: "left",
        click_count: 2
      },
      meta: {
        host: "codex",
        codexTurnMetadata: {
          session_id: "session-alpha",
          turn_id: "turn-beta"
        },
        computerUseTrace: {
          enabled: true,
          outputDir: traceDir
        }
      }
    });

    assert.deepEqual(response, { id: 12, ok: true, result: null });

    const evidence = await readSingleEvidence(traceDir, "session-alpha", "turn-beta");
    assert.equal(evidence.actionType, "click");
    assert.equal(evidence.status, "success");
    assert.equal(evidence.trace.enabledSource, "request_meta");
    assert.equal(evidence.trace.outputDirSource, "request_meta");
    assert.equal(evidence.hostSource, "codex");
    assert.deepEqual(evidence.targetWindow, { id: 101, app: "demo.exe", title: "Demo" });
    assert.deepEqual(evidence.clickCoordinates, {
      x: 144,
      y: 288,
      mouseButton: "left",
      clickCount: 2
    });
    assert.equal(evidence.error, null);
    assert.equal(evidence.response.ok, true);
    assert.equal(evidence.payloadMetrics.requestEnvelope.utf8Bytes > 0, true);
    assert.equal(evidence.payloadMetrics.requestParams.estimatedTokens > 0, true);
    assert.equal(evidence.payloadMetrics.responseEnvelope.estimatedTokens > 0, true);
    assert.equal(evidence.payloadMetrics.responseBody.estimatedTokens >= 1, true);
    assert.equal(evidence.payloadMetrics.thrownError, null);
    assert.deepEqual(
      evidence.artifacts.map((artifact: { kind: string }) => artifact.kind),
      ["request", "activation", "pointer", "response"]
    );
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
});

test("config-level trace writes failure evidence for rejected actions", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "computer-use-trace-config-"));
  const traceDir = path.join(sandboxDir, "trace-output");

  try {
    const scaffold = createScaffoldRuntime({
      trace: {
        enabled: true,
        outputDir: traceDir
      }
    });

    await assert.rejects(
      scaffold.dispatcher.dispatch({
        id: 13,
        method: "press_key",
        params: {
          window: { id: 101, app: "demo.exe" },
          key: "   "
        },
        meta: {
          host: "claude-code",
          codexTurnMetadata: {
            session_id: "session-gamma",
            turn_id: "turn-delta"
          }
        }
      }),
      /press_key requires a key string/
    );

    const evidence = await readSingleEvidence(traceDir, "session-gamma", "turn-delta");
    assert.equal(evidence.actionType, "press_key");
    assert.equal(evidence.status, "error");
    assert.equal(evidence.trace.enabledSource, "config");
    assert.equal(evidence.hostSource, "claude-code");
    assert.equal(evidence.error.message, "press_key requires a key string");
    assert.equal(evidence.payloadMetrics.responseEnvelope, null);
    assert.equal(evidence.payloadMetrics.responseBody, null);
    assert.equal(evidence.payloadMetrics.thrownError.estimatedTokens > 0, true);
    assert.deepEqual(
      evidence.artifacts.map((artifact: { kind: string }) => artifact.kind),
      ["request", "error"]
    );
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
});

test("trace captures discovery artifacts for list_windows", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "computer-use-trace-discovery-"));
  const traceDir = path.join(sandboxDir, "trace-output");

  try {
    const scaffold = createScaffoldRuntime({
      trace: {
        enabled: true,
        outputDir: traceDir
      }
    });

    const response = await scaffold.dispatcher.dispatch({
      id: 14,
      method: "list_windows",
      params: {},
      meta: {
        host: "codex",
        codexTurnMetadata: {
          session_id: "session-discovery",
          turn_id: "turn-list-windows"
        }
      }
    });

    assert.deepEqual(response, {
      id: 14,
      ok: true,
      result: [{ id: 101, app: "demo.exe", title: "Demo Window" }]
    });

    const evidence = await readSingleEvidence(traceDir, "session-discovery", "turn-list-windows");
    assert.equal(evidence.actionType, "list_windows");
    assert.equal(evidence.status, "success");
    assert.deepEqual(
      evidence.artifacts.map((artifact: { kind: string }) => artifact.kind),
      ["request", "windows", "response"]
    );
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
});

test("trace captures get_window_state screenshot artifacts including the raw snapshot", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "computer-use-trace-capture-"));
  const traceDir = path.join(sandboxDir, "trace-output");

  try {
    const scaffold = createScaffoldRuntime({
      trace: {
        enabled: true,
        outputDir: traceDir
      }
    });

    const response = await scaffold.dispatcher.dispatch({
      id: 15,
      method: "get_window_state",
      params: {
        window: { id: 101, app: "demo.exe", title: "Demo Window" }
      },
      meta: {
        host: "codex",
        codexTurnMetadata: {
          session_id: "session-capture",
          turn_id: "turn-window-state"
        }
      }
    });

    assert.equal(response.ok, true);
    const evidence = await readSingleEvidence(traceDir, "session-capture", "turn-window-state");
    assert.equal(evidence.actionType, "get_window_state");
    assert.equal(evidence.status, "success");
    assert.deepEqual(
      evidence.artifacts.map((artifact: { kind: string }) => artifact.kind),
      ["request", "window-state", "uia", "raw-screenshot", "screenshot", "response"]
    );
    assert.equal(evidence.screenshots.before?.fileName, "window-state.jpg");
    assert.equal(evidence.screenshots.after, null);

    const actionDir = await resolveSingleActionDir(traceDir, "session-capture", "turn-window-state");
    const windowStateArtifact = JSON.parse(
      await readFile(path.join(actionDir, "window-state.json"), "utf8")
    );
    assert.equal(windowStateArtifact.screenshot.data, "<base64:9 bytes>");
    assert.equal(windowStateArtifact.screenshot.raw.data, "<base64:8 bytes>");
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
});

test("trace captures before/after window state snapshots for UIA mutations", async () => {
  const sandboxDir = await mkdtemp(path.join(tmpdir(), "computer-use-trace-uia-"));
  const traceDir = path.join(sandboxDir, "trace-output");

  try {
    const scaffold = createScaffoldRuntime({
      trace: {
        enabled: true,
        outputDir: traceDir
      }
    });

    const response = await scaffold.dispatcher.dispatch({
      id: 16,
      method: "set_value",
      params: {
        window: { id: 101, app: "demo.exe", title: "Demo Window" },
        element_index: 1,
        value: "updated"
      },
      meta: {
        host: "codex",
        codexTurnMetadata: {
          session_id: "session-uia",
          turn_id: "turn-set-value"
        }
      }
    });

    assert.deepEqual(response, { id: 16, ok: true, result: null });

    const evidence = await readSingleEvidence(traceDir, "session-uia", "turn-set-value");
    assert.equal(evidence.actionType, "set_value");
    assert.deepEqual(
      evidence.artifacts.map((artifact: { kind: string }) => artifact.kind),
      [
        "request",
        "before-window-state",
        "before-uia",
        "before-raw-screenshot",
        "before-screenshot",
        "after-window-state",
        "after-uia",
        "after-raw-screenshot",
        "after-screenshot",
        "activation",
        "uia",
        "state-diff",
        "response"
      ]
    );
    assert.equal(evidence.screenshots.before?.fileName, "before-window-state.jpg");
    assert.equal(evidence.screenshots.after?.fileName, "after-window-state.jpg");

    const actionDir = await resolveSingleActionDir(traceDir, "session-uia", "turn-set-value");
    const diffArtifact = JSON.parse(await readFile(path.join(actionDir, "state-diff.json"), "utf8"));
    assert.equal(diffArtifact.changed, false);
    assert.deepEqual(diffArtifact.changedFields, []);
  } finally {
    await rm(sandboxDir, { recursive: true, force: true });
  }
});

async function readSingleEvidence(traceDir: string, sessionId: string, turnId: string): Promise<any> {
  const actionDir = await resolveSingleActionDir(traceDir, sessionId, turnId);
  const evidencePath = path.join(actionDir, "evidence.json");
  return JSON.parse(await readFile(evidencePath, "utf8"));
}

async function resolveSingleActionDir(traceDir: string, sessionId: string, turnId: string): Promise<string> {
  const turnDir = path.join(traceDir, sessionId, turnId);
  const actionDirectories = await readdir(turnDir);
  assert.equal(actionDirectories.length, 1);
  return path.join(turnDir, actionDirectories[0]!);
}
