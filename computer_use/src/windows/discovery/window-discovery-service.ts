import type { AppDescriptor } from "../../core/contracts/app.js";
import type { GetWindowParams, ListAppsResult } from "../../core/contracts/discovery.js";
import type { WindowRef } from "../../core/contracts/window.js";

export interface WindowDiscoveryPort {
  listWindows(): Promise<readonly WindowRef[]>;
  getWindow(params: GetWindowParams): Promise<WindowRef>;
  listApps(): Promise<readonly AppDescriptor[] | ListAppsResult>;
}

export class WindowDiscoveryService {
  constructor(private readonly port: WindowDiscoveryPort) {}

  async listWindows(): Promise<readonly WindowRef[]> {
    const windows = await this.port.listWindows();
    return windows.map(validateWindowRef);
  }

  async getWindow(params: GetWindowParams): Promise<WindowRef> {
    validateGetWindowParams(params);
    return validateWindowRef(await this.port.getWindow(params));
  }

  async listApps(): Promise<ListAppsResult> {
    const apps = normalizeAppsPayload(await this.port.listApps());
    return {
      apps: apps.map(validateAppDescriptor)
    };
  }
}

function normalizeAppsPayload(
  payload: readonly AppDescriptor[] | ListAppsResult
): readonly AppDescriptor[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (isListAppsResult(payload)) {
    return payload.apps;
  }

  throw new Error("discovery returned an invalid apps payload");
}

function isListAppsResult(value: unknown): value is ListAppsResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      "apps" in value &&
      Array.isArray((value as { apps?: unknown }).apps)
  );
}

export function validateGetWindowParams(params: GetWindowParams): void {
  if (!Number.isInteger(params?.id) || params.id < 0) {
    throw new Error("get_window requires a non-negative integer id");
  }

  if (params.app !== undefined && (typeof params.app !== "string" || params.app.trim().length === 0)) {
    throw new Error("get_window app must be a non-empty string when provided");
  }
}

export function validateWindowRef(window: WindowRef): WindowRef {
  if (typeof window?.id !== "number" || !Number.isFinite(window.id) || window.id < 0) {
    throw new Error("discovery returned an invalid window id");
  }

  if (typeof window?.app !== "string" || window.app.trim().length === 0) {
    throw new Error("discovery returned an invalid window app identifier");
  }

  if (window.title !== undefined && typeof window.title !== "string") {
    throw new Error("discovery returned an invalid window title");
  }

  return {
    id: window.id,
    app: window.app,
    ...(window.title ? { title: window.title } : {})
  };
}

export function validateAppDescriptor(app: AppDescriptor): AppDescriptor {
  if (typeof app?.id !== "string" || app.id.trim().length === 0) {
    throw new Error("discovery returned an invalid app identifier");
  }

  if (!Array.isArray(app.windows)) {
    throw new Error("discovery returned an invalid app window list");
  }

  return {
    id: app.id,
    ...(app.displayName ? { displayName: app.displayName } : {}),
    ...(app.executablePath ? { executablePath: app.executablePath } : {}),
    ...(typeof app.isRunning === "boolean" ? { isRunning: app.isRunning } : {}),
    ...(app.lastUsedDate ? { lastUsedDate: app.lastUsedDate } : {}),
    ...(typeof app.useCount === "number" ? { useCount: app.useCount } : {}),
    ...(app.activationModel ? { activationModel: app.activationModel } : {}),
    windows: app.windows.map(validateWindowRef)
  };
}
