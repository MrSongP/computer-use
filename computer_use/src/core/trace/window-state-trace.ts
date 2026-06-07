import type { WindowStateResult } from "../contracts/capture.js";
import type { ActionTraceCapture, TraceErrorInfo } from "./tracer.js";

export async function writeWindowStateTraceArtifacts(
  trace: ActionTraceCapture,
  state: WindowStateResult,
  options: {
    label?: string;
    attachScreenshotTo?: "before" | "after";
  } = {}
): Promise<WindowStateTraceArtifactPaths> {
  const filePrefix = options.label ? `${options.label}-` : "";
  const kindPrefix = options.label ? `${options.label}-` : "";
  const paths: WindowStateTraceArtifactPaths = {};

  const response = await trace.writeJsonArtifact(
    `${kindPrefix}window-state`,
    `${filePrefix}window-state.json`,
    redactWindowStatePayloads(state)
  );
  if (response?.absolutePath) {
    paths.responsePath = response.absolutePath;
  }

  if (state.text) {
    await trace.writeJsonArtifact(`${kindPrefix}uia`, `${filePrefix}uia-tree.json`, state.text);
  }

  if (state.screenshot?.raw) {
    const rawBytes = Buffer.from(state.screenshot.raw.data, "base64");
    const rawScreenshot = await trace.writeBinaryArtifact(
      `${kindPrefix}raw-screenshot`,
      `${filePrefix}window-state-raw.png`,
      rawBytes,
      state.screenshot.raw.mime
    );
    if (rawScreenshot?.absolutePath) {
      paths.rawScreenshotPath = rawScreenshot.absolutePath;
    }
  }

  if (state.screenshot) {
    const bytes = Buffer.from(state.screenshot.data, "base64");
    const screenshot = await trace.writeBinaryArtifact(
      `${kindPrefix}screenshot`,
      `${filePrefix}window-state.jpg`,
      bytes,
      state.screenshot.mime
    );

    if (options.attachScreenshotTo === "before") {
      trace.attachBeforeScreenshot(screenshot ?? null);
    }
    if (options.attachScreenshotTo === "after") {
      trace.attachAfterScreenshot(screenshot ?? null);
    }
    if (screenshot?.absolutePath) {
      paths.screenshotPath = screenshot.absolutePath;
    }
  }

  return paths;
}

export interface WindowStateTraceArtifactPaths {
  screenshotPath?: string;
  rawScreenshotPath?: string;
  responsePath?: string;
}

export function stripTraceOnlyWindowStateFields(state: WindowStateResult): WindowStateResult {
  if (!state.screenshot?.raw) {
    return state;
  }

  return {
    ...state,
    screenshot: {
      ...state.screenshot,
      raw: undefined
    }
  };
}

export async function captureTraceWindowStateSnapshot(args: {
  trace: ActionTraceCapture;
  label: string;
  attachScreenshotTo?: "before" | "after";
  getState: () => Promise<WindowStateResult>;
}): Promise<WindowStateResult | null> {
  if (!args.trace.isEnabled()) {
    return null;
  }

  try {
    const state = await args.getState();
    await writeWindowStateTraceArtifacts(args.trace, state, {
      label: args.label,
      attachScreenshotTo: args.attachScreenshotTo
    });
    return state;
  } catch (error) {
    await args.trace.writeJsonArtifact(
      `${args.label}-capture-error`,
      `${args.label}-capture-error.json`,
      toTraceErrorInfo(error)
    );
    return null;
  }
}

export function summarizeWindowStateDiff(
  before: WindowStateResult | null,
  after: WindowStateResult | null
): {
  changed: boolean;
  changedFields: string[];
  before: WindowStateSummary | null;
  after: WindowStateSummary | null;
} {
  const changedFields: string[] = [];

  if (before === null || after === null) {
    return {
      changed: before !== after,
      changedFields: before === after ? changedFields : ["snapshot-availability"],
      before: before ? summarizeWindowState(before) : null,
      after: after ? summarizeWindowState(after) : null
    };
  }

  if (JSON.stringify(before.window) !== JSON.stringify(after.window)) {
    changedFields.push("window");
  }
  if (JSON.stringify(before.screenshot) !== JSON.stringify(after.screenshot)) {
    changedFields.push("screenshot");
  }
  if (JSON.stringify(before.text) !== JSON.stringify(after.text)) {
    changedFields.push("text");
  }

  return {
    changed: changedFields.length > 0,
    changedFields,
    before: summarizeWindowState(before),
    after: summarizeWindowState(after)
  };
}

export interface WindowStateSummary {
  window: WindowStateResult["window"];
  screenshot: {
    source: string;
    width: number;
    height: number;
    byteLength: number;
    rawByteLength: number | null;
  } | null;
  text: {
    rootRole: string;
    rootName: string | null;
    nodeCount: number;
  } | null;
}

function summarizeWindowState(state: WindowStateResult): WindowStateSummary {
  return {
    window: state.window,
    screenshot: state.screenshot
      ? {
          source: state.screenshot.source,
          width: state.screenshot.width,
          height: state.screenshot.height,
          byteLength: state.screenshot.byteLength,
          rawByteLength: state.screenshot.raw?.byteLength ?? null
        }
      : null,
    text: state.text
      ? {
          rootRole: state.text.role,
          rootName: state.text.name ?? null,
          nodeCount: countAccessibilityNodes(state.text)
        }
      : null
  };
}

function redactWindowStatePayloads(state: WindowStateResult): WindowStateResult {
  if (!state.screenshot) {
    return state;
  }

  return {
    ...state,
    screenshot: {
      ...state.screenshot,
      data: `<base64:${state.screenshot.byteLength} bytes>`,
      raw: state.screenshot.raw
        ? {
            ...state.screenshot.raw,
            data: `<base64:${state.screenshot.raw.byteLength} bytes>`
          }
        : undefined
    }
  };
}

function countAccessibilityNodes(node: NonNullable<WindowStateResult["text"]>): number {
  let count = 1;
  for (const child of node.children) {
    count += countAccessibilityNodes(child);
  }
  return count;
}

function toTraceErrorInfo(error: unknown): TraceErrorInfo {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    name: "NonErrorThrown",
    message: String(error)
  };
}
