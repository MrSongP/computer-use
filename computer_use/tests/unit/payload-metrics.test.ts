import test from "node:test";
import assert from "node:assert/strict";
import { createPayloadMetrics, estimateTokenCount } from "../../src/core/trace/payload-metrics.js";
import type { ActionTraceEvidence } from "../../src/core/trace/tracer.js";
import { summarizeTraceEvidence } from "../../src/core/trace/trace-summary.js";

test("createPayloadMetrics reports stable byte and token counts", () => {
  const metrics = createPayloadMetrics({
    tool: "click",
    text: "你好, world",
    count: 2
  });

  assert.equal(metrics.charCount > 0, true);
  assert.equal(metrics.utf8Bytes >= metrics.charCount, true);
  assert.equal(metrics.estimatedTokens > 0, true);
  assert.equal(metrics.estimator, "heuristic_mixed_text_v1");
});

test("estimateTokenCount treats compact ascii as cheaper than punctuation-heavy payloads", () => {
  assert.equal(estimateTokenCount(""), 0);
  assert.equal(estimateTokenCount("click"), 2);
  assert.equal(estimateTokenCount("你好世界"), 4);
  assert.equal(estimateTokenCount("{\"x\":1,\"y\":2}") > estimateTokenCount("xy12"), true);
});

test("summarizeTraceEvidence aggregates duration, error rate, and response token counts", () => {
  const evidence = [
    createEvidence("click", "success", 10, 5, 12),
    createEvidence("click", "error", 50, 7, 3),
    createEvidence("scroll", "success", 30, 11, 20)
  ];

  const summary = summarizeTraceEvidence(evidence);
  const clickSummary = summary.byAction.click;
  const scrollSummary = summary.byAction.scroll;

  assert.equal(summary.overall.count, 3);
  assert.equal(summary.overall.errorCount, 1);
  assert.notEqual(clickSummary, undefined);
  assert.notEqual(scrollSummary, undefined);
  assert.equal(clickSummary!.count, 2);
  assert.equal(clickSummary!.errorRate, 0.5);
  assert.equal(scrollSummary!.totalResponseTokens, 20);
  assert.equal(clickSummary!.p95DurationMs, 50);
});

function createEvidence(
  actionType: ActionTraceEvidence["actionType"],
  status: ActionTraceEvidence["status"],
  durationMs: number,
  requestTokens: number,
  responseTokens: number
): ActionTraceEvidence {
  return {
    schemaVersion: "computer-use-trace/v1",
    actionId: `${actionType}-1`,
    actionType,
    requestId: "1",
    sessionId: "session",
    turnId: "turn",
    hostSource: "codex",
    driverName: "mock",
    startedAt: "2026-06-04T00:00:00.000Z",
    endedAt: "2026-06-04T00:00:00.100Z",
    durationMs,
    status,
    trace: {
      enabled: true,
      enabledSource: "config",
      outputDir: "C:\\trace",
      outputDirSource: "config"
    },
    payloadMetrics: {
      requestEnvelope: {
        charCount: 10,
        utf8Bytes: 10,
        estimatedTokens: requestTokens + 1,
        estimator: "heuristic_mixed_text_v1"
      },
      requestParams: {
        charCount: 9,
        utf8Bytes: 9,
        estimatedTokens: requestTokens,
        estimator: "heuristic_mixed_text_v1"
      },
      responseEnvelope: {
        charCount: 8,
        utf8Bytes: 8,
        estimatedTokens: responseTokens + 1,
        estimator: "heuristic_mixed_text_v1"
      },
      responseBody: {
        charCount: 7,
        utf8Bytes: 7,
        estimatedTokens: responseTokens,
        estimator: "heuristic_mixed_text_v1"
      },
      thrownError: null
    },
    targetWindow: null,
    inputParams: null,
    clickCoordinates: null,
    elementInfo: null,
    beforeState: {
      timestamp: "2026-06-04T00:00:00.000Z",
      interrupted: false,
      currentTurn: null
    },
    afterState: {
      timestamp: "2026-06-04T00:00:00.100Z",
      interrupted: false,
      currentTurn: null
    },
    screenshots: {
      before: null,
      after: null
    },
    artifacts: [],
    response: status === "success" ? { ok: true } : { ok: false, code: "failure", error: "boom" },
    error: status === "success" ? null : { name: "RpcErrorResponse", message: "boom", code: "failure" }
  };
}
