import path from "node:path";
import type { WindowRef } from "../../core/contracts/window.js";

export interface OperationStatus {
  title: string;
  detail: string;
}

export function buildOperationStatus(method: string, payload: Record<string, unknown>): OperationStatus {
  switch (method) {
    case "activateWindow":
      return {
        title: "Focus Window",
        detail: `Bring ${describeWindow(readWindow(payload.window))} to the front`
      };
    case "sendPointerClick":
      return {
        title: "Click",
        detail: `Click ${describeWindow(readWindow(payload.targetWindow))}${describePoint(payload.click)}`
      };
    case "sendPointerScroll":
      return {
        title: "Scroll",
        detail: `Scroll at the target point${describePoint(payload.scroll)}`
      };
    case "sendPointerDrag":
      return {
        title: "Drag",
        detail: `Drag across the target area${describeDrag(payload.drag)}`
      };
    case "sendText":
      return {
        title: "Type Text",
        detail: `Enter text${describeTextLength(payload.text)}`
      };
    case "sendKeyboardInputs":
      return {
        title: "Press Key",
        detail: "Send keyboard input to the target window"
      };
    case "listWindows":
      return {
        title: "Find Windows",
        detail: "Find targetable windows"
      };
    case "getWindow":
      return {
        title: "Resolve Window",
        detail: "Resolve the target window"
      };
    case "listApps":
      return {
        title: "Find Apps",
        detail: "Find launchable apps and open windows"
      };
    case "launchApp":
      return {
        title: "Launch App",
        detail: `Open or reuse ${describeApp(payload.app)}`
      };
    case "getWindowState":
      return {
        title: "View State",
        detail: `Read ${describeWindow(readWindow(readParams(payload).window))}`
      };
    case "clickElement":
      return {
        title: "Click",
        detail: `Click ${describeElement(readParams(payload))}`
      };
    case "setValue":
      return {
        title: "Set Value",
        detail: `Set ${describeElement(readParams(payload))}`
      };
    case "performSecondaryAction":
      return {
        title: "Action",
        detail: `Run ${describeAction(readParams(payload).action)}`
      };
    case "getVirtualScreenMetrics":
      return {
        title: "Screen",
        detail: "Read screen layout"
      };
    default:
      return {
        title: toDisplayTitle(method),
        detail: "Operate the target app"
      };
  }
}

function readParams(payload: Record<string, unknown>): Record<string, unknown> {
  return isRecord(payload.params) ? payload.params : {};
}

function readWindow(value: unknown): WindowRef | undefined {
  return isRecord(value) && typeof value.id === "number" && typeof value.app === "string"
    ? value as unknown as WindowRef
    : undefined;
}

function describeWindow(window: WindowRef | undefined): string {
  if (!window) {
    return "the target window";
  }

  const title = normalizeText(window.title);
  if (title) {
    return title;
  }

  const app = normalizeText(window.app);
  if (app) {
    return basenameWithoutExtension(app);
  }

  return `window ${window.id}`;
}

function describeApp(value: unknown): string {
  const app = typeof value === "string" ? value : "";
  return normalizeText(app) ? basenameWithoutExtension(app) : "the app";
}

function describePoint(value: unknown): string {
  if (!isRecord(value) || typeof value.x !== "number" || typeof value.y !== "number") {
    return "";
  }

  return ` (${Math.round(value.x)}, ${Math.round(value.y)})`;
}

function describeDrag(value: unknown): string {
  if (
    !isRecord(value) ||
    typeof value.fromX !== "number" ||
    typeof value.fromY !== "number" ||
    typeof value.toX !== "number" ||
    typeof value.toY !== "number"
  ) {
    return "";
  }

  return ` (${Math.round(value.fromX)}, ${Math.round(value.fromY)}) -> (${Math.round(value.toX)}, ${Math.round(value.toY)})`;
}

function describeTextLength(value: unknown): string {
  return typeof value === "string" ? ` (${value.length} chars)` : "";
}

function describeElement(params: Record<string, unknown>): string {
  const index = typeof params.element_index === "number" ? params.element_index : undefined;
  const window = describeWindow(readWindow(params.window));
  return index === undefined ? window : `element #${index} in ${window}`;
}

function describeAction(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "the selected action";
}

function basenameWithoutExtension(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const base = path.basename(normalized);
  const extension = path.extname(base);
  return extension.length > 0 ? base.slice(0, -extension.length) : base;
}

function toDisplayTitle(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
