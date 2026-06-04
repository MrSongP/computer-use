import type { ActionTraceEvidence } from "./tracer.js";

export interface TraceSummaryMetrics {
  count: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  totalDurationMs: number;
  avgDurationMs: number;
  p95DurationMs: number;
  avgRequestTokens: number;
  avgResponseTokens: number;
  totalResponseTokens: number;
  avgRequestBytes: number;
  avgResponseBytes: number;
}

export interface TraceSummaryReport {
  overall: TraceSummaryMetrics;
  byAction: Record<string, TraceSummaryMetrics>;
}

export function summarizeTraceEvidence(evidenceList: readonly ActionTraceEvidence[]): TraceSummaryReport {
  const byActionEntries = groupByAction(evidenceList);
  const byAction = Object.fromEntries(
    Array.from(byActionEntries.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([action, evidence]) => [action, summarizeBucket(evidence)])
  );

  return {
    overall: summarizeBucket(evidenceList),
    byAction
  };
}

function groupByAction(
  evidenceList: readonly ActionTraceEvidence[]
): Map<string, ActionTraceEvidence[]> {
  const grouped = new Map<string, ActionTraceEvidence[]>();
  for (const evidence of evidenceList) {
    const bucket = grouped.get(evidence.actionType);
    if (bucket) {
      bucket.push(evidence);
      continue;
    }
    grouped.set(evidence.actionType, [evidence]);
  }
  return grouped;
}

function summarizeBucket(evidenceList: readonly ActionTraceEvidence[]): TraceSummaryMetrics {
  if (evidenceList.length === 0) {
    return {
      count: 0,
      successCount: 0,
      errorCount: 0,
      errorRate: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      p95DurationMs: 0,
      avgRequestTokens: 0,
      avgResponseTokens: 0,
      totalResponseTokens: 0,
      avgRequestBytes: 0,
      avgResponseBytes: 0
    };
  }

  const durations = evidenceList.map((entry) => entry.durationMs).sort((left, right) => left - right);
  const successCount = evidenceList.filter((entry) => entry.status === "success").length;
  const errorCount = evidenceList.length - successCount;

  const totalDurationMs = durations.reduce((sum, value) => sum + value, 0);
  const totalRequestTokens = evidenceList.reduce(
    (sum, entry) => sum + entry.payloadMetrics.requestParams.estimatedTokens,
    0
  );
  const totalResponseTokens = evidenceList.reduce(
    (sum, entry) => sum + (entry.payloadMetrics.responseBody?.estimatedTokens ?? 0),
    0
  );
  const totalRequestBytes = evidenceList.reduce(
    (sum, entry) => sum + entry.payloadMetrics.requestParams.utf8Bytes,
    0
  );
  const totalResponseBytes = evidenceList.reduce(
    (sum, entry) => sum + (entry.payloadMetrics.responseBody?.utf8Bytes ?? 0),
    0
  );

  return {
    count: evidenceList.length,
    successCount,
    errorCount,
    errorRate: errorCount / evidenceList.length,
    totalDurationMs,
    avgDurationMs: totalDurationMs / evidenceList.length,
    p95DurationMs: percentile(durations, 0.95),
    avgRequestTokens: totalRequestTokens / evidenceList.length,
    avgResponseTokens: totalResponseTokens / evidenceList.length,
    totalResponseTokens,
    avgRequestBytes: totalRequestBytes / evidenceList.length,
    avgResponseBytes: totalResponseBytes / evidenceList.length
  };
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }

  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return values[index]!;
}
